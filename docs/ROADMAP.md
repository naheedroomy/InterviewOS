# AnswerCue Roadmap

_Review date: 2026-08-20_

This is the canonical, current priority list for AnswerCue. It contains only priorities supported by current engineering evidence; see [PROJECT_STATUS.md](PROJECT_STATUS.md) for verified shipped capabilities and open risks, and [ARCHITECTURE.md](ARCHITECTURE.md) for system boundaries. Historical engineering and testing reports are archived under `docs/archive/` and are evidence only — they must not override this document. See [README.md](README.md) for the documentation index.

## Current priorities

Priorities are ordered by risk-then-value. Each item names the evidence that supports it and the definition of done.

### 1. Live Electron/audio validation

Real-window, real-audio, and screen-capture validation is not yet complete. Automated unit/integration coverage exists, but it does not prove the packaged app works end to end on a real machine.

- **Evidence:** [PROJECT_STATUS.md](PROJECT_STATUS.md) verification status; [TESTING.md](TESTING.md) manual validation boundaries.
- **Definition of done:** the manual macOS smoke checklist in [TESTING.md](TESTING.md) passes on a clean machine, including microphone and system-audio capture, screen capture, and transcript persistence.

### 2. Playwright E2E completion

Browser-only smoke tests exist, but full end-to-end Playwright coverage is not complete.

- **Evidence:** [PROJECT_STATUS.md](PROJECT_STATUS.md) verification status; [TESTING.md](TESTING.md) Playwright setup and limitations.
- **Definition of done:** Playwright scenarios cover the core interview flow against a real Electron window, with Electron/preload failures treated as harness issues unless the test runs against a real window.

### 3. IPC, path, SSRF, and log hardening

Remaining hardening work on the renderer↔main trust boundary: token/credential redaction over IPC, renderer-supplied path allowlisting, custom-provider SSRF protection, and sensitive log redaction.

- **Evidence:** [PROJECT_STATUS.md](PROJECT_STATUS.md) open risks; historical tickets in the [engineering archive index](archive/engineering/README.md) (for example the parity roadmap's Phase 1 security items).
- **Definition of done:** every IPC channel that returns a token or credential returns a masked shape; every IPC handler accepting a path validates it against app-owned directories; custom-provider URLs reject loopback/metadata targets unless local mode is on; sentinel secrets never appear in logs.

### 4. Database encryption

SQLite persistence is plaintext. An encryption design exists but has not been implemented.

- **Evidence:** [PROJECT_STATUS.md](PROJECT_STATUS.md) open risks; [LOCAL_DB_ENCRYPTION_DESIGN.md](archive/engineering/LOCAL_DB_ENCRYPTION_DESIGN.md) is the design document and does **not** mean encryption is implemented.
- **Definition of done:** the database is encrypted at rest per the reviewed design, with migration handling for existing plaintext databases.

### 5. Provider, Gemini, and Google-STT integration completion

Provider routing exists, but Gemini and Google speech-to-text integration work remains unresolved.

- **Evidence:** [PROJECT_STATUS.md](PROJECT_STATUS.md) open risks; [ARCHITECTURE.md](ARCHITECTURE.md) provider routing and STT provider selection.
- **Definition of done:** Gemini model discovery and Google STT flows are validated end to end with real credentials, and any remaining provider gaps are closed or explicitly documented.

### 6. macOS release readiness

macOS signing/notarization state is unresolved and must be verified for each release.

- **Evidence:** [PROJECT_STATUS.md](PROJECT_STATUS.md) open risks; [RELEASE.md](RELEASE.md) signing/notarization checklist.
- **Definition of done:** a release build passes the signing/notarization verification steps in [RELEASE.md](RELEASE.md), or the release is explicitly published as unsigned with the known limitations stated.

## Near-term reliability and security work

- Complete the hardening items in priority 3 and land the encryption design review from priority 4.
- Close the live-validation gap in priority 1 before declaring release readiness.
- Keep the release pipeline honest: signing/notarization is verified per release, never assumed from an earlier build.

## Validation work

- Run the repository test commands in [TESTING.md](TESTING.md) as part of any change: `npm run build:electron` and `npm test`.
- Run the manual macOS smoke checklist in [TESTING.md](TESTING.md) before any release.
- Record dated validation results under `docs/archive/`; do not merge them into this document or [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Deferred ideas

The following ideas are **not current priorities**. They come from the superseded root-level [ROADMAP.md](archive/root/ROADMAP.md) (last updated March 2026) and are listed here only so they are not mistaken for active work. They are not scheduled and have no engineering evidence behind them in this repository.

- **AnswerCue token / Pro access** — token-based rewards, wallet connection, blockchain verification, and governance rights.
- **Mobile app development** — no mobile client exists or is planned.
- **Collaborative features** — multi-user meetings and shared workspaces.
- **Plugin ecosystem** — third-party plugin API and marketplace.
- **System design visualization engine** — diagram generation from meeting discussion.
- **Persona system** — the current app has an AI persona setting; the broader predefined-persona library described in the old roadmap is not planned.

If any of these are revived, they must be re-scoped against current architecture and given a fresh decision in this document.