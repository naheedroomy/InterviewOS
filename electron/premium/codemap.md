# electron/premium/

## Responsibility

This folder is the **open-source-side premium boundary**. It holds the code that lets the
AGPL open-source build compile and run cleanly even when the proprietary `premium/` submodule
is absent. Its only source file, `featureGate.ts`, is a centralized runtime probe that tells
the rest of the app whether the paid premium modules are present in this build.

It does **not** contain the premium implementation itself. The actual paid modules
(`LicenseManager`, `KnowledgeOrchestrator`, `KnowledgeDatabaseManager`, `TavilySearchProvider`,
`AnswerCueSearchProvider`, `DocType`, etc.) live in the `premium/electron/` submodule, which is
a private/unavailable repository and is **not present in this checkout** (see AGENTS.md).

## Design

- **Single source file:** `featureGate.ts` exports two functions:
  - `isPremiumAvailable(): boolean` — probes for the two critical premium modules via
    `require('../../premium/electron/services/LicenseManager')` and
    `require('../../premium/electron/knowledge/KnowledgeOrchestrator')`. If both resolve, it
    returns `true`; if either throws, it returns `false` and logs
    `[FeatureGate] Premium modules not available — running in open-source mode.`
  - `resetFeatureGate(): void` — clears the cached result (used for testing).
- **Caching:** the probe result is memoized in a module-level `_premiumAvailable` variable after
  the first call, so the (potentially expensive) `require` probe runs only once per process.
- **Fail-open vs fail-closed:** the gate is **fail-closed** for premium features — if the probe
  throws, premium is treated as unavailable and the app runs in open-source mode. This is the
  intended behavior so the open-source build never depends on proprietary code.
- **Compile-time boundary:** `electron/tsconfig.json` includes `../premium/electron/**/*.ts`
  in its `include` list, so premium sources compile into `dist-electron/` when the submodule is
  present. `scripts/build-electron.js` conditionally adds `premium/electron` as an esbuild entry
  point only `if (fs.existsSync(premiumDir))`, so the build succeeds with or without premium.

## Flow

1. At runtime, app code calls `isPremiumAvailable()` (or, in the current codebase, performs its
   own equivalent inline `require` probe — see Integration).
2. The gate attempts to `require` the two critical premium modules.
3. Success → `_premiumAvailable = true`; premium features are enabled.
4. Failure (module missing / throws) → `_premiumAvailable = false`; the app falls back to
   open-source behavior (e.g. profile intelligence disabled, license checks skipped).
5. `resetFeatureGate()` clears the cache so a later call re-probes (test hook).

## Integration

- **`electron/main.ts`** — does **not** import `featureGate.ts`. Instead it performs its own
  inline `try { require('../premium/electron/knowledge/KnowledgeOrchestrator') ... } catch`
  (around line 453-461) to conditionally load `KnowledgeOrchestrator` and
  `KnowledgeDatabaseManager`, logging `[Main] Knowledge modules not available — profile
  intelligence disabled.` on failure. This is the same pattern `featureGate.ts` centralizes.
- **`electron/ipcHandlers.ts`** — guards premium IPC handlers with inline
  `require('../premium/electron/...')` calls for `LicenseManager`, `DocType`,
  `TavilySearchProvider`, and `AnswerCueSearchProvider`. These are wrapped so the open-source
  build runs without the submodule.
- **`electron/tsconfig.json`** — includes `../premium/electron/**/*.ts` so premium code is
  type-checked/compiled when present.
- **`scripts/build-electron.js`** — conditionally bundles `premium/electron` only when the
  directory exists.
- **Tests** — `electron/services/__tests__/*.test.mjs` reference compiled premium modules under
  `dist-electron/premium/electron/...` (e.g. `licenseVerifyPolicy.js`,
  `KnowledgeDatabaseManager.js`, `KnowledgeOrchestrator.js`), so premium tests only run when the
  submodule is present and built.
- **Current wiring status:** `featureGate.ts` is defined but **not yet imported** anywhere in
  `electron/` (grep finds only its own definition). The live gating today is done via the inline
  `try/catch require` blocks in `main.ts` and `ipcHandlers.ts`. `featureGate.ts` is the intended
  centralized replacement/abstraction for that pattern.
