# AnswerCue Testing

_Review date: 2026-08-20_

This is the canonical testing guide for AnswerCue. It documents the supported test commands, the layers they cover, the manual Electron checks, and the known coverage limitations. Dated test-result reports are archived under `docs/archive/` and are historical evidence — they must not be read as the current test state. See [README.md](README.md) for the documentation index and [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current verification status.

## Test layers

AnswerCue has four distinct validation layers. They are not interchangeable:

| Layer | What it covers | How it runs |
| --- | --- | --- |
| Unit/integration tests | Service, LLM, and audio-module logic via `node --test` | `npm test` |
| Browser-only Playwright smoke tests | Renderer flows in a plain browser (no Electron) | `npm run test:e2e` |
| Live Electron validation | Real window, real IPC, real preload bridge | Manual (`npm start`) |
| Real audio / screen-capture validation | Microphone, system audio, screen capture, permissions | Manual |

Automated unit/integration coverage exists and is the fast feedback loop. Live Electron, real audio, screen capture, and complete Playwright validation remain incomplete — see [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Repository commands

### First-time setup

```bash
npm install
npm run build:native
```

`npm install` runs postinstall steps that rebuild native dependencies (`better-sqlite3`, `keytar`), download the local transcription model, and patch the Electron plist. `npm run build:native` builds the Rust native audio module.

Prerequisites: Node.js 20+ or 22 LTS, npm, Rust/Cargo for the native audio module, and Xcode Command Line Tools on macOS.

### Fast checks

```bash
npm run build:electron
npm test
```

`npm run build:electron` compiles the Electron main/preload TypeScript. `npm test` runs `build:electron` first, then runs the `node --test` suite over `electron/services/__tests__/**`, `electron/llm/__tests__/**`, and `electron/audio/__tests__/**`.

### Running the app

```bash
npm start
```

This runs Vite on `http://localhost:5180` and launches Electron.

### Browser-only Playwright smoke tests

Browser-only smoke tests are configured around port `5173`, while Electron dev uses `5180`. Start Vite on `5173` separately and pass the same port to the tests:

```bash
npm run dev -- --port 5173 --strictPort
ELECTRON_APP_PORT=5173 npx playwright test
```

Treat Electron/preload failures in browser-only Playwright as harness issues unless the test is run against a real Electron window.

## Manual macOS smoke checklist

Run this before any release. Launch Electron with `npm start`, then:

1. Grant Microphone, Screen Recording, and Accessibility permissions if prompted.
2. Open Settings and configure one AI provider.
3. Confirm the input and output audio devices.
4. Create a New Interview.
5. Add prep context.
6. Attach a sample document.
7. Start the interview.
8. Verify transcript updates.
9. Stop the interview.
10. Confirm prep chat, transcript, and post-interview chat persist.

See [LOCAL_STT_ANSWERCUE_SETUP.md](LOCAL_STT_ANSWERCUE_SETUP.md) for the focused local-transcription check and troubleshooting.

## Coverage limitations

- **Live Electron/audio/manual validation is incomplete.** Automated tests do not prove the packaged app works end to end on a real machine.
- **Complete Playwright validation is incomplete.** Browser-only smoke tests exist, but full end-to-end Playwright coverage against a real Electron window is not complete.
- **Test results vary by environment.** Audio-capture, Gemini model-discovery, and STT-provider tests depend on real devices, network access, and credentials; they can fail in headless or offline environments without indicating a regression.
- **Historical test totals are not a current number.** Dated reports recorded different totals at different times (for example 349 tests in the [final integration report](archive/engineering/ANSWERCUE_PARITY_FINAL_INTEGRATION_REPORT.md) and 371 tests in the [E2E results report](archive/testing/ANSWERCUE_PARITY_E2E_RESULTS.md)). The suite has grown since those reports; treat each report's total as evidence for its own date, not as the current count.

## Historical evidence

Dated test-result and engineering reports are archived under `docs/archive/` and are evidence only:

- [archive/testing/README.md](archive/testing/README.md) — testing report index, including dated E2E and test-result reports.
- [archive/engineering/README.md](archive/engineering/README.md) — engineering report index, including parity fix logs and integration reports.

Archived reports must not override this document or [PROJECT_STATUS.md](PROJECT_STATUS.md).