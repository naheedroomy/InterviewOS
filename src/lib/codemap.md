# src/lib/

## Responsibility

Shared utility/library layer for the renderer (React + Electron overlay UI). It holds
small, mostly **pure** helper modules that are extracted out of the large overlay
component (`src/components/AnswerCueInterface.tsx`) so they can be unit-tested in
isolation, plus theme/appearance constants, feature flags, and STT error mapping.

Two distinct kinds of code live here:

1. **Pure logic modules** (`.mjs` + `.d.mts` pairs) — deterministic functions over
   message/state slices, extracted for Node-ESM unit tests. These are the bulk of the
   folder and the primary reason it exists.
2. **Constants / config / small utilities** (`.ts`) — theme constants, feature flags,
   a classnames helper, and an STT error categorizer.

## Design

### `.mjs` + `.d.mts` pairing (pure logic)
The pure modules are authored as `.mjs` (ESM) so they run under Node's ESM in the test
harness, where `.ts` resolution is unavailable. Each ships a hand-written `.d.mts`
declaration so TypeScript consumers (`AnswerCueInterface.tsx`) get types. The `.mjs`
files deliberately **do not import `.ts` modules** (e.g. `genMessageId` from
`src/utils/messageId.ts`) — instead they re-implement the needed behavior locally
(e.g. a default id factory) to stay test-runnable.

### Message row shape
The overlay chat is modeled as an array of rows:
`{ id: string, role: 'system'|..., text: string, intent?: string, isStreaming?: boolean }`.
`intent` distinguishes streams (e.g. `what_to_answer`, `chat`, clarify/recap). All the
message-persistence and streaming helpers operate on this shape and return **new arrays**
(immutable updates).

### Race-safe, idempotent streaming
The streaming helpers are built to survive races between token arrival and finalize:
- Finalize commits **by id** (`streamingMsgId`) when available, and appends using that
  same id if the row hasn't mounted yet (deferred-mount idempotency).
- `applyFirstStreamingToken` treats a row that was already finalized (`isStreaming ===
  false`) as a no-op so a late mount can't double text or re-open a closed stream.
- The default id factory uses `Date.now()` + a random-seeded counter so ids can't
  collide across HMR/test reloads or within the same millisecond.

### Dedup guards
Quick-action and typed-submit dedup normalize input (trim / collapse whitespace /
lowercase) and suppress a repeat within a time window (`windowMs`, default 5000).

### Theming
Two layers:
- `overlayAppearance.ts` computes **inline** `React.CSSProperties` for light/dark
  overlays, scaling alpha/blur/shadow by a normalized opacity strength.
- The `liquid-glass` theme is handled by **CSS variables** via
  `[data-interface-theme="liquid-glass"]`; `getGlassOverlayAppearance()` returns empty
  style objects so inline styles don't fight the CSS.
- `meetingInterfaceTheme.ts` persists the chosen theme in `localStorage` and broadcasts
  changes **cross-window** through `electronAPI.setMeetingInterfaceTheme` (Electron
  BrowserWindows are separate Chromium contexts; the `storage` event doesn't cross them).

### Feature / promo flags
`featureFlags.ts` and `promoSurfaceFlags.ts` are compile-time switches to hide premium /
promotional UI in the open-source build. Backend licensing is still enforced via
`electronAPI` IPC; these flags are cosmetic only.

## Flow

Primary consumer is `src/components/AnswerCueInterface.tsx` (the overlay). It wires
incoming IPC events (STT transcripts, intelligence token/finalize events, quick actions,
typed submits) through the pure helpers to update its message state:

```
IPC event (STT / intelligence / action / submit)
        │
        ▼
AnswerCueInterface.tsx  ──►  pure lib helpers
        │                       ├─ overlaySttPersistence   (interviewer transcript → rolling bar)
        │                       ├─ overlayMessagePersistence (finalize / placeholder / null-feedback)
        │                       ├─ streamingTokenQueue      (token coalescing, flush, commit)
        │                       ├─ overlayIntelligenceGeneration (accept/reject late IPC)
        │                       ├─ overlayActionDedup / overlaySubmitDedup (dedup)
        │                       ├─ overlayStealthFocusGuards (focus / tap-engage gating)
        │                       └─ whatToAnswerFormat        (format WTA answer rows)
        ▼
message state (rows)  ──►  rendered overlay UI
```

`streamingTokenQueue.mjs` itself imports from `overlayMessagePersistence.mjs` and
`overlayIntelligenceGeneration.mjs`, so the streaming path composes the persistence and
generation guards.

`SettingsOverlay.tsx` writes theme + opacity (via `meetingInterfaceTheme` /
`overlayAppearance`); the overlay reads them at mount and on `storage`/IPC events.

## Integration

### Consumers (renderer)
- `src/components/AnswerCueInterface.tsx` — imports nearly all pure `.mjs` modules plus
  `overlayAppearance`, `meetingInterfaceTheme` (type), `whatToAnswerFormat`.
- `src/components/SettingsOverlay.tsx` — `overlayAppearance`, `meetingInterfaceTheme`.
- `src/components/ui/TopPill.tsx` — `OverlayAppearance` type.
- `src/components/ui/RollingTranscript.tsx`, `ui/ChannelCard.tsx` — `sttErrorMapper`.
- `src/components/ProfileIntelligenceSettings.tsx` — `promoSurfaceFlags`.
- `src/components/SupportToaster.tsx`, `ui/toast.tsx`, `ui/dialog.tsx` — `utils.cn`.

### Tests
`src/lib/__tests__/` exercises the pure `.mjs` modules directly (overlayActionDedup,
overlaySubmitDedup, overlayMessagePersistence, overlaySttPersistence,
streamingTokenQueue, whatToAnswerFormat, whatToAnswerNullResult).

### Notes / possibly-dead modules
- `curl-validator.ts` (`validateCurl` via `@bany/curl-to-json`) has **no renderer
  consumer** found; the Electron main process has its own `electron/utils/curlUtils.ts`.
  Likely legacy/unused.
- `glassDisplacementMap.ts` (`GLASS_DISPLACEMENT_MAP` base64 data URI) is referenced
  only within itself; the liquid-glass visuals are driven by CSS variables, so this may
  be vestigial.
- `overlaySttPersistence.mjs` is currently consumed only by its unit test (not imported
  by the renderer).
