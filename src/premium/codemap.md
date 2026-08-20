# src/premium/

## Responsibility

Frontend boundary for the optional "premium" feature set. This folder is a thin, always-safe loader that exposes premium UI components and an ad-campaign hook to the rest of the app. The actual premium components live in a separate repo-root `premium/` directory (a private/unavailable submodule); this loader bridges to it via Vite's `import.meta.glob`.

Because the loader is the only thing the app imports, removing the `premium/` folder (open-source build) compiles cleanly: the globs resolve to empty objects and no-op fallbacks are exported instead. No build errors, no dangling imports.

## Design

- **Single entry point**: `index.tsx` is the only file in this folder and the only module consumers import (`from './premium'` or `from '../premium'`).
- **Glob-based optional loading**: eleven `import.meta.glob<any>(..., { eager: true })` calls target `../../premium/src/<Component>.tsx` (resolving to repo-root `premium/src/`). When that directory is absent, each glob returns `{}`.
- **`get<T>(mods, name, fallback)` helper**: takes the first module value from a glob result and returns its named export, or the supplied fallback when the module/export is missing.
- **Fallback values**:
  - `NullComponent` — `React.FC<any>` rendering `null`; used for every component export.
  - `nullAdCampaigns` — hook fallback returning `{ activeAd: null, dismissAd: noop, previewAd: noop }`; matches the real hook's return shape so callers can destructure unconditionally.
- **Typing**: all component exports are typed `React.FC<any>`; the hook export is typed as `typeof nullAdCampaigns`. Types are intentionally loose since the real module is optional.

## Exports

| Export | Source module (repo-root `premium/src/`) | Fallback |
|---|---|---|
| `PremiumUpgradeModal` | `PremiumUpgradeModal.tsx` | `NullComponent` |
| `ProfileVisualizer` | `ProfileVisualizer.tsx` | `NullComponent` |
| `PremiumPromoToaster` | `PremiumPromoToaster.tsx` | `NullComponent` |
| `ProfileFeatureToaster` | `ProfileFeatureToaster.tsx` | `NullComponent` |
| `JDAwarenessToaster` | `JDAwarenessToaster.tsx` | `NullComponent` |
| `RemoteCampaignToaster` | `RemoteCampaignToaster.tsx` | `NullComponent` |
| `useAdCampaigns` | `useAdCampaigns.ts` | `nullAdCampaigns` |
| `NegotiationCoachingCard` | `NegotiationCoachingCard.tsx` | `NullComponent` |
| `AnswerCueApiPromoToaster` | `AnswerCueApiPromoToaster.tsx` | `NullComponent` |
| `MaxUltraUpgradeToaster` | `MaxUltraUpgradeToaster.tsx` | `NullComponent` |
| `ModesSettings` | `ModesSettings.tsx` (via `default` export) | `NullComponent` |

Note: `ModesSettings` is the only export read via the module's `default` export; all others use named exports.

## Flow

1. Consumers import named exports from `./premium` (index.tsx).
2. At module load, the eager globs attempt to pull each component from repo-root `premium/src/`.
3. `get()` resolves each export: real component if present, fallback otherwise.
4. Consumers render/use the resolved value. With the premium folder absent, components render nothing and `useAdCampaigns` returns a null-ad object — callers see a no-op premium surface.

## Integration

Consumers (all outside this folder):

- **`src/App.tsx`** — imports `JDAwarenessToaster`, `ProfileFeatureToaster`, `PremiumPromoToaster`, `RemoteCampaignToaster`, `PremiumUpgradeModal`, `AnswerCueApiPromoToaster`, `MaxUltraUpgradeToaster`, `useAdCampaigns`; wires toasters/modal into the main app shell and feeds `useAdCampaigns` with plan/profile/app-state.
- **`src/components/ProfileIntelligenceSettings.tsx`** — imports `ProfileVisualizer`, `PremiumUpgradeModal`.
- **`src/components/SettingsOverlay.tsx`** — imports `ProfileVisualizer`, `PremiumUpgradeModal`.
- **`src/components/AnswerCueInterface.tsx`** — imports `NegotiationCoachingCard`.
- **`src/components/settings/ModesSettings.tsx`** — re-exports `ModesSettings` as its default export (`export { ModesSettings as default } from '../../premium'`), so the settings UI can render the premium modes panel when available.

The repo-root `premium/` directory is a private/unavailable submodule (per AGENTS.md); in this public checkout it is absent, so all fallbacks are active and premium surfaces are inert no-ops.