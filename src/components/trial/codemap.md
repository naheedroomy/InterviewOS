# src/components/trial/

Free-trial UI surface: three presentational components covering the full trial lifecycle — pre-trial promo (start trial), during-trial countdown, post-trial upgrade.

## Responsibility

Owns the *rendering* of the trial funnel. The folder holds exactly three self-contained components, all pure presentational — no trial domain logic, no state persistence, no API calls. Everything trial-related (token presence, expiry, usage counters, key presence, start/wipe actions) is owned by a parent and fed in via props + callbacks:

| Component | Stage | Job |
|---|---|---|
| `TrialPromoToaster.tsx` | Pre-trial | Full-screen glass offer card. Appears ~10s after launch when no API key and no trial; CTA starts trial or routes to manual setup. |
| `FreeTrialBanner.tsx` | During trial | Persistent countdown strip (time remaining + usage mini-bars + Upgrade CTA). Not dismissible while trial runs. |
| `FreeTrialModal.tsx` | Post-trial / upgrade | Upgrade panel with 4 plan cards (Standard/Max/Ultra/Pro) + BYOK path. Internal step machine for the BYOK wipe flow. |

## Design

- **Prop-driven, stateless-of-domain.** Each component is a pure function of its props; the parent decides *when* to mount each (banner only while `expiresAt` valid, modal on upgrade click, toaster gated by launch conditions).
- **Local state is presentation-only.**
  - Banner: `remaining` countdown refreshed on a 1s `setInterval` (cleared on expiry/unmount), plus derived `isWarning` (< 2 min) / `expired` flags.
  - Modal: `step` state machine — `'choose' → 'wiping' → 'done'` (error bounces back to `'choose'` with message); per-card `hov` hover state.
  - Toaster: `visible` (gated by a `10_000ms` `STARTUP_DELAY_MS` timer), `starting` (in-flight trial start), `error`.
- **Framer Motion throughout** (`AnimatePresence` + `motion`): spring card entrance, staggered hero copy, shimmer sweeps on CTAs, aurora pulses, animated gradient border rings. Every animation honors `useReducedMotion()` — reduced mode falls back to opacity-only or static gradient variants.
- **Design tokens are inline constants.** Modal uses the `C` (white opacity stops) + `ACC` (per-accent palettes: violet/indigo/amber/slate) maps; toaster uses its own `T` token map. Apple-style dark glass language, violet accent shared across all three.
- **Hardcoded checkout URLs** as module constants (`PLAN_*_URL`, Dodo Payments `checkout.dodopayments.com/buy/pdt_…`), shared between modal and banner via duplicated `PLAN_PRO_URL`.
- **Electron bridge accessed untyped** via `(window.electronAPI as any)` — two calls: `openExternal(url)` and `convertTrial(plan)`. No local typing; the codebase relies on ambient/preload types.
- **Toaster gating keys** in `localStorage`: `natively_trial_promo_ts` (7-day cooldown) and `natively_perms_shown_v1` (first-launch detection — promo suppressed on very first run).
- **Quota model is hardcoded** into the display math: 10 AI requests, 10 min STT (600 s), 2 searches. Banner computes percentages (`ai/10`, `stt_seconds/600`, `search/2`, capped at 100%); modal formats minutes as `(stt_seconds/60).toFixed(1)`.

## Flow

**TrialPromoToaster** — parent mounts it with `isOpen` true. Gate check in `useEffect`: bail if `hasAnswerCueKey || hasTrialToken`, if `natively_perms_shown_v1` absent (first launch), or if within 7-day cooldown of `natively_trial_promo_ts`. Passes gates → `setTimeout` 10s → `visible`. User paths:
- **Start free trial** → `starting=true` → `await onStartTrial()` → writes cooldown key, closes; failure → inline error, `starting=false`.
- **"I'll set up manually"** → writes cooldown, closes, `onManualSetup()` (parent opens Settings).
- **Dismiss** (X or backdrop click) → writes cooldown, closes, `onDismiss()`.

**FreeTrialBanner** — mounted while trial active with `expiresAt` + `usage`. 1s interval recomputes `remaining`; at 0 the interval self-clears and UI flips to amber "Trial ended". UsagePip bars turn amber at ≥ 80% of quota. **Upgrade** button fires `onUpgrade()` → parent opens `FreeTrialModal`.

**FreeTrialModal** — starts at `choose`. Four tiers + BYOK:
- Plan card click → fire-and-forget `window.electronAPI.convertTrial(plan)` (backend conversion, `.catch(()=>{})`), Standard additionally awaits the parent's `onStandard()`, then `openExternal(checkout URL)`. No in-app waiting state — the browser takes over checkout.
- BYOK click → `handleByok()`: `step='wiping'` (spinner: "Cleaning up trial data…") → `await onByok()` → `step='done'` (checkmark, "Add your API keys in Settings → AI Providers", Continue → `onDone()`). On rejection → error text + back to `choose`.

Data flows one way: parent owns trial state and passes it down; components only call back up (start / upgrade / byok / dismiss / done).

## Integration

- **Electron preload bridge** (`window.electronAPI`):
  - `openExternal(url)` — opens Dodo Payments checkout in the system browser (toaster has none; modal + banner use it).
  - `convertTrial('standard' | 'pro' | 'max' | 'ultra')` — trial→paid conversion triggered optimistically when a plan card is clicked.
- **Props contract** with the owning parent (typical wiring):
  - Banner: `{ expiresAt: string; usage: { ai: number; stt_seconds: number; search: number }; onUpgrade: () => void }`.
  - Modal: `{ usage; onByok: () => Promise<void>; onStandard?: () => Promise<void>; onDone?: () => void }`.
  - Toaster: `{ isOpen; hasAnswerCueKey; hasTrialToken; onDismiss; onStartTrial: () => Promise<void>; onManualSetup }`.
- **localStorage** (toaster only): `natively_trial_promo_ts` (promo cooldown), `natively_perms_shown_v1` (first-launch gate — set by the permissions toaster elsewhere).
- **Assets**: imports app icon from `../icon.png` (modal header).
- **No direct coupling** between the three components — the parent mediates all transitions (toaster → trial start → banner; banner Upgrade → modal). The folder can be lifted or replaced without touching the rest of the app as long as the props contract is kept.
