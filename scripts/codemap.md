# scripts/

## Responsibility

This folder holds every Node.js automation script the repo needs that is not part of the app's runtime code: the Electron build, native Rust module build, model downloads, dependency repair for cross-arch packaging, macOS signing/notarization/DMG post-processing, packaging-input guards, and dev/maintenance utilities. The scripts are invoked from `package.json` npm scripts and from electron-builder hooks (`afterPack`, `afterAllArtifactBuild`).

Nothing here runs inside the packaged app at runtime — these are all build-time, install-time, and dev-time tools. The one exception is `patch-electron-plist.js`, which mutates the *development* Electron.app so dev runs get correct macOS TCC permission prompts.

## Design

Patterns across the folder:

- **Side-effect scripts, thin helpers.** Most scripts are top-level imperative code that runs when executed (build, postinstall, one-shot generators). Only `staple-with-retry.js` exports a reusable function in addition to a CLI entry.
- **electron-builder hook contract.** `ad-hoc-sign.js` and `notarize.js` export `async (context) => …` (electron-builder's `afterPack` / `afterSign` hook signature); `afterAllArtifactBuild.cjs` exports `async (buildResult) => […]` (`afterAllArtifactBuild` hook, must return the artifact list).
- **Guarded by platform + credentials.** macOS-only logic checks `process.platform === 'darwin'` early; signing/notarization scripts no-op when no identity/credentials are configured so dev and unsigned builds never fail for lack of an Apple account.
- **Environment-flag knobs** (never hardcoded secrets):
  - `ANSWERCUE_BUILD_ALL_MAC_ARCHES=1` — build native module for both macOS arches.
  - `ANSWERCUE_PRODUCTION_SIGN=1` — set by `electron-builder.signed.cjs` to make the ad-hoc signer stand down.
  - `ANSWERCUE_SKIP_NOTARIZE=1` — explicit notarization escape hatch.
  - `ANSWERCUE_DOWNLOAD_STT_MODEL=1` — opt into bundling the Moonshine STT model at build time.
  - `ANSWERCUE_ADHOC_HARDENED=1` — opt into hardened-runtime ad-hoc signing for TCC testing.
- **Cross-arch package repair.** npm skips optional deps whose `cpu` field doesn't match the host. `ensure-sqlite-vec.js` and `ensure-sharp-mac-deps.js` both fetch the missing platform tarballs via `npm pack` and extract them into `node_modules` (versions pinned from the lockfile for sharp), so a build on arm64 can still produce x64 artifacts.
- **Verification built in.** `verify-package-inputs.js` checks build inputs before packaging; `afterAllArtifactBuild.cjs` re-verifies the signature of the app *inside* every rebuilt DMG and asserts the updater ZIP manifest matches disk bytes before letting a release go out; `build-native.js` verifies the expected `.node` artifacts exist after `napi build`.

## Flow

### Build flow (renderer + Electron)

1. `npm run build` — `clean` (rimraf `dist`, `dist-electron`) → `tsc` → `vite build` → `dist/`.
2. `npm run build:electron` — `scripts/build-electron.js` esbuild-bundles every `electron/**/*.ts` (and `premium/electron/**/*.ts` if the submodule is present) into `dist-electron/` (CJS, `platform: node`, `target: node20`, sourcemaps). `electron`, `better-sqlite3`, `keytar`, `sqlite-vec` are external. It also copies the pdf-parse web worker to `dist-electron/electron/pdf.worker.mjs` (warns if missing — PDF upload breaks). No type checking — that's `npm run typecheck:electron` (`tsc --noEmit`) or `build:electron:tsc`.
3. Tests and bench scripts run `build:electron` first because they import the compiled `dist-electron` output (e.g. `bench-screen-understanding.mjs` imports `dist-electron/electron/services/screen/ImageOptimizer.js`).
4. `npm run verify:package-inputs` — `scripts/verify-package-inputs.js` asserts `dist/index.html` and `dist-electron/electron/main.js` exist; `--require-native` additionally asserts the platform's `native-module/index.<platform>-<arch>.node`; an asar path argument checks those files inside the archive via `@electron/asar` (tries both path separator styles).

### Native module build flow (`npm run build:native`)

`scripts/build-native.js` builds the Rust napi module in `native-module/`:

- macOS: resolves the clang runtime lib dir via `clang -print-resource-dir` (fallback: scan Xcode toolchain) and overrides `LIBRARY_PATH` so Rust cross-compilation links against the right clang runtime version. Adds the rust target (`rustup target add`), runs `npx napi build --platform --target <target> --release` per target. Target set: current arch only by default, or both `x86_64-apple-darwin` + `aarch64-apple-darwin` with `ANSWERCUE_BUILD_ALL_MAC_ARCHES=1`. Then `fixMacOSDylibPaths` runs `otool -L` and rewrites absolute dylib dependencies to `@loader_path/<name>` via `install_name_tool` so the `.node` is portable. Verifies `index.darwin-{x64,arm64}.node` artifacts exist.
- Other platforms: single `npx napi build --platform --release`, then verifies the expected artifact per platform/arch map (`index.win32-*-msvc.node`, `index.linux-*-gnu.node`).

### Packaging flow

**Dev/unsigned** — `npm run app:build` / `npm run dist`:
`npm run build` → `npm run build:electron` → `ANSWERCUE_BUILD_ALL_MAC_ARCHES=1 npm run build:native` → `node scripts/download-models.js` → `node scripts/ensure-sharp-mac-deps.js` → `electron-builder` (uses `package.json` `build`).

- electron-builder `afterPack` → `scripts/ad-hoc-sign.js` (macOS only):
  1. Disguises helper process display names to `CoreServices Helper[ (GPU| Renderer| Plugin)]` via `PlistBuddy` on `CFBundleDisplayName`/`CFBundleName` (folder/binary names untouched — renaming breaks Chromium process spawning). Runs before signing so a real Developer ID signature would cover the edits.
  2. Stands down entirely if a real identity is configured (`ANSWERCUE_PRODUCTION_SIGN`/`CSC_LINK`/`CSC_NAME`/`ANSWERCUE_SIGN_IDENTITY`).
  3. Otherwise ad-hoc signs the app: `codesign --force --deep --entitlements build/entitlements.mac.plist --sign -` first, then re-signs each `app.asar.unpacked/native-module/*.node` with entitlements (because `--deep` does not attach entitlements to nested binaries).
- `package.json` `build` uses `mac.identity: null`, hardenedRuntime false, targets zip (x64+arm64) + dmg (x64). `files` ships `dist`, `dist-electron`, `native-module` (excluding `target/`, `src/`, `.cargo/`), `node_modules`; `asarUnpack` `**/*.node` and `**/*.dylib`; `extraResources` copy `assets/`, the icns, and `resources/models/Xenova/`.

**Production signed** — `npm run app:build:signed` / `npm run dist:signed`:
Same build chain but `electron-builder --config electron-builder.signed.cjs`. That config sets `ANSWERCUE_PRODUCTION_SIGN=1` (ad-hoc signer stands down), enables Developer ID identity + hardened runtime + entitlements + built-in `notarize: true`, builds only `zip` targets (x64+arm64) so signatures survive, and bakes `extraMetadata.answercueSigned: true` (main process uses it to allow true `quitAndInstall`). Defaults `APPLE_KEYCHAIN_PROFILE=answercue-notary` and `APPLE_TEAM_ID=QKN8WTSJYG` (non-secrets; overridable).

- After eb finishes, `afterAllArtifactBuild` → `scripts/afterAllArtifactBuild.cjs` (macOS only):
  1. No-op without notarization credentials or a Developer ID identity.
  2. For each arch dir (`mac`, `mac-arm64`) with a signed `.app`: rebuilds the DMG from the pristine signed `.app` via `create-dmg` (staging with `ditto` to preserve signatures) — this is the fix for electron-builder's DMG layout corrupting the embedded app signature. Signs the DMG container with the Developer ID.
  3. `xcrun notarytool submit --wait` + `xcrun stapler staple` per DMG.
  4. Mounts each DMG (`hdiutil attach`) and verifies the embedded `.app` passes `codesign --verify --deep --strict` + `spctl -a -t execute` (Gatekeeper "Notarized Developer ID") — regression guard for the eb DMG-corruption bug.
  5. Patches `sha512`/`size` for the new DMG bytes in every `latest*.yml`, then asserts the updater ZIP entries in the yml match the on-disk zips (the auto-updater downloads the ZIP; a stale hash fails the build loudly).

### Notarization paths

- **Active path:** electron-builder built-in (`mac.notarize: true` in `electron-builder.signed.cjs`) submits + staples the `.app`; the DMGs are handled by `afterAllArtifactBuild.cjs`.
- **Standby path:** `scripts/notarize.js` is a ready-to-wire `afterSign` hook using `@electron/notarize` with three credential strategies (App Store Connect API key → Apple ID + app-specific password → keychain profile), no-op when credentials are absent or `ANSWERCUE_SKIP_NOTARIZE=1`. It exists because `@electron/notarize` staples only once and can hit the Error 65 staple race; it defers retry to `staple-with-retry.js`.
- **`scripts/staple-with-retry.js`:** runs `xcrun stapler staple` + `stapler validate` with exponential backoff (default 6 attempts from 15 s base, doubling ≈ up to ~8 min), retrying only the CDN-propagation race ("Record not found" / Error 65). Usable as CLI (`node scripts/staple-with-retry.js <path> [maxAttempts] [baseDelayMs]`) or module (`stapleWithRetry`).

### Model download flow

`scripts/download-models.js` runs in `postinstall` and in `app:build`/`app:build:signed`. Uses `@huggingface/transformers` with `env.cacheDir`/`env.localModelPath` = `resources/models/`:

- Always: `Xenova/all-MiniLM-L6-v2` (feature extraction — RAG embeddings) and `Xenova/mobilebert-uncased-mnli` (zero-shot classification — intent classifier).
- Only with `ANSWERCUE_DOWNLOAD_STT_MODEL=1`: Moonshine base ASR bundle (`onnx-community/moonshine-base-ONNX`) in fp32 and mixed fp32/q8; validates the required package files exist afterward. Normal releases skip it — Moonshine downloads at first-run preflight into app data so installers stay small and updates don't replace the cached model.

### Install-time (`postinstall`) flow

`cross-env SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm rebuild sharp` → `electron-rebuild -f -w better-sqlite3,keytar` → `node scripts/download-models.js` → `node scripts/ensure-sqlite-vec.js` → `node scripts/patch-electron-plist.js`.

- `ensure-sqlite-vec.js`: force-installs `sqlite-vec-darwin-arm64` and `sqlite-vec-darwin-x64` (v0.1.7-alpha.2) via `npm pack` + `tar xzf --strip-components=1` into `node_modules` when missing (npm skips non-matching `cpu` optional deps, e.g. building x64 release on arm64).
- `ensure-sharp-mac-deps.js` (darwin only, also run in `app:build`): installs missing `@img/sharp-{darwin-arm64,darwin-x64}` and `@img/sharp-libvips-{darwin-arm64,darwin-x64}` packages, versions read from `package-lock.json` → `sharp` optionalDependencies. Fails if they can't be installed.
- `patch-electron-plist.js` (idempotent): patches the dev `node_modules/electron/dist/Electron.app/Contents/Info.plist` — sets `CFBundleDisplayName`/`CFBundleName` to `AnswerCue` and adds/updates `NSScreenCaptureUsageDescription`, `NSAudioCaptureUsageDescription`, `NSMicrophoneUsageDescription`. Without the screen-capture key, macOS silently refuses the TCC prompt (or grants it under `com.github.Electron` and the grant is lost on reinstall).

### Maintenance / dev utilities

- `VectorStoreRebuild.js` — one-shot generator: writes `electron/rag/VectorStore.ts` from an embedded template string (SQLite-backed vector store; native `sqlite-vec` `vec0` search with JS cosine-similarity worker-thread fallback; chunk + summary embedding dual-write; re-indexing helpers). Run it to regenerate that file after editing the template.
- `raw-to-wav.js` — debug helper: wraps `~/elevenlabs_debug.raw` (16 kHz mono 16-bit PCM) in a 44-byte WAV header → `~/elevenlabs_debug.wav` (for inspecting ElevenLabs debug audio output).
- `bench-screen-understanding.mjs` — deterministic benchmark of the vision-first screen-understanding path: Sharp `ImageOptimizer` across 4 synthetic textured screenshot sizes × 4 profiles (fast/balanced/technical/best), cache-write vs cache-hit latency, and `VisionProviderFallbackChain` overhead using instant fake providers (warm path and first-provider-fails fallback). Not measured: real LLM latency, desktopCapturer, native OCR. Emits JSON to stdout for `docs/testing/SCREEN_UNDERSTANDING_PERFORMANCE.md`. Requires `npm run build:electron` first; iteration count via `SCREEN_UNDERSTANDING_BENCH_ITERATIONS` (default 5); `ANSWERCUE_TEST_USER_DATA` defaults to the tmp dir.

## Integration

- **package.json npm scripts** are the primary callers: `build:electron`, `build:native`, `verify:package-inputs`, `app:build`, `app:build:signed`, `dist`, `dist:signed`, `bench:screen-understanding`, and `postinstall`.
- **electron-builder hook wiring:** `afterPack: ./scripts/ad-hoc-sign.js` in `package.json` `build` (dev path); `afterAllArtifactBuild` in `electron-builder.signed.cjs` (production path). `notarize.js` is written and documented as an `afterSign` hook but is currently standby — the signed config uses electron-builder's built-in `mac.notarize: true` instead.
- **Build output contract:** the rest of the repo depends on these exact outputs:
  - `dist-electron/electron/main.js` — Electron main entry (loaded by `electron .`, and asserted by `verify-package-inputs.js` and the asar checks). `dist-electron/` also holds the compiled services that `node --test` suites and the bench script import (`vectorSearchWorker.js`, `services/screen/*.js`, etc.).
  - `dist/` — renderer bundle from Vite.
  - `native-module/index.<platform>-<arch>.node` — loaded by the app (listed in esbuild `external` so it stays a runtime require), unpacked from asar (`asarUnpack`) because of `.node`/`.dylib`, and re-signed with entitlements by the ad-hoc signer.
  - `resources/models/Xenova/` — ONNX models copied into the package via `extraResources`; the Moonshine ASR model is deliberately *not* bundled (downloaded at first-run preflight into app data instead).
  - `release/latest*.yml` + `*.zip` + `*.dmg` — electron-builder output consumed by the GitHub-publish config and the auto-updater; `afterAllArtifactBuild.cjs` keeps the yml hashes consistent with the rebuilt DMGs and validates the ZIP entries.
- **macOS permission integration:** `patch-electron-plist.js` (dev) and `package.json` `build.mac.extendInfo` (packaged) both declare the TCC usage descriptions (`NSScreenCaptureUsageDescription`, `NSAudioCaptureUsageDescription`, `NSMicrophoneUsageDescription`) that the main process needs for screen/system-audio/mic capture during interviews; `ad-hoc-sign.js` and the signed config attach `build/entitlements.mac.plist` for hardened-runtime/JIT.
