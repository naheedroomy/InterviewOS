# AnswerCue Documentation

AnswerCue is an open-source desktop interview assistant for preparing interview context, transcribing live interviews, generating real-time answer support, and continuing the conversation afterward with the full interview history available as context. It runs on macOS 12+ (Apple Silicon or Intel) and Windows 10/11 (Intel/AMD 64-bit), supports OpenAI, Google Gemini, and Anthropic Claude provider keys from Settings, and uses the packaged local Moonshine Base model for live transcription.

## Source of truth

This directory is the source of truth for current AnswerCue documentation. Current architecture, project status, roadmap, testing, release, and local transcription guidance live here. Historical engineering and testing reports live under [docs/archive/](archive/) and are evidence only — they must not override current guidance.

The repository root keeps standard project entry points and legal/community documents, including `README.md`, `CHANGELOG.md`, `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md`, `LICENSE`, `termsandcondition.md`, and `refund.md`.

## Current status

_Review date: 2026-08-20_

**Shipped foundations:**

- Electron desktop app with preflight setup, prep chat, document context, live interview, and post-interview chat.
- LLM provider routing for OpenAI, Google Gemini, and Anthropic Claude.
- Local transcription support through the packaged Moonshine Base model.
- Audio capture, document ingestion, RAG/interview persistence, screenshot context, custom modes, and post-interview workflows.

**Unresolved gaps:**

- Live Electron/audio/manual validation and complete Playwright validation remain incomplete.
- SQLite persistence is plaintext; encryption has been designed but not implemented.
- Remaining IPC, logging, path, and SSRF hardening.
- macOS signing/notarization state is unresolved and must be verified for each release.

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the full status summary and links to dated historical evidence.

## Canonical documents

| Document | Purpose |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current system boundaries, core flows, trust boundaries, and implementation anchors. |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Verified shipped capabilities, known gaps, validation state, and review date. |
| [ROADMAP.md](ROADMAP.md) | Current priorities, near-term reliability/security work, and deferred ideas. |
| [TESTING.md](TESTING.md) | Supported test commands, test layers, manual Electron checks, and coverage limitations. |
| [RELEASE.md](RELEASE.md) | Build, signing, notarization, packaging, and release checklist. |
| [LOCAL_STT_ANSWERCUE_SETUP.md](LOCAL_STT_ANSWERCUE_SETUP.md) | Local transcription setup, expected user experience, and troubleshooting. |

## Policy and community documents

- [PRIVACY.md](../PRIVACY.md) — privacy policy describing current desktop app behavior.
- [SECURITY.md](../SECURITY.md) — supported versions and vulnerability reporting.
- [CHANGELOG.md](../CHANGELOG.md) — chronological shipped release history.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contributor guidance.
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) — community standards.

## Archive

Historical engineering, testing, and superseded root-level reports are archived under [docs/archive/](archive/).

- [archive/README.md](archive/README.md) — archive policy and index.
- [archive/engineering/README.md](archive/engineering/README.md) — historical engineering reports.
- [archive/testing/README.md](archive/testing/README.md) — historical testing reports.
- [archive/root/README.md](archive/root/README.md) — superseded root-level reports.

Archived files are historical evidence, not current requirements or status.

## Maintenance rules

- Update the focused canonical document, not this index: architecture in `ARCHITECTURE.md`, status in `PROJECT_STATUS.md`, priorities in `ROADMAP.md`, test evidence in `TESTING.md`, release readiness in `RELEASE.md`.
- Record a review date in every canonical status document when it is updated.
- Archive dated reports and superseded findings under `docs/archive/`; do not merge them into canonical documents.
- New documentation must be linked from this index or placed in the archive.
- Root `README.md` stays the concise product and developer entry point.
