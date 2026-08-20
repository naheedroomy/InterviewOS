# AnswerCue Project Status

_Review date: 2026-08-20_

This is the canonical, current implementation-status summary for AnswerCue. It separates what is shipped and verified from what remains unresolved. Historical engineering and testing reports are archived under `docs/archive/` and are evidence only — they must not override this document. See [README.md](README.md) for the documentation index and [ARCHITECTURE.md](ARCHITECTURE.md) for system boundaries and flows.

## Shipped foundations

The following capabilities are implemented in the current codebase:

- **Electron desktop app** with preflight setup, prep chat, document context, live interview, and post-interview chat.
- **LLM provider routing** for OpenAI, Google Gemini, and Anthropic Claude (plus additional providers such as Groq, Codex CLI, DeepSeek, and Ollama).
- **Local transcription support** through the packaged Moonshine Base model.
- **Audio capture** (microphone and system audio) via the Rust native module.
- **Document ingestion** — Markdown, TXT, PDF, and DOCX ingested to Markdown locally, with document classification (Resume / Project / Other).
- **RAG / interview persistence** — meeting transcripts, AI interactions, RAG chunks, and embeddings persisted in SQLite.
- **Screenshot context** — screen capture and vision-first screen analysis.
- **Custom modes** — user-defined modes with custom instructions and reference files.
- **Post-interview workflows** — continuing the conversation with prep chat, selected docs, transcript, and generated AI responses available as context.

## Verification status

- **Automated coverage exists** — unit/integration tests run via `npm test` (see [TESTING.md](TESTING.md) for supported commands and layers).
- **Live Electron/audio/manual validation remains incomplete** — real-window, real-audio, and screen-capture validation is not yet complete.
- **Complete Playwright validation remains incomplete** — browser-only smoke tests exist, but full end-to-end Playwright coverage is not complete.

## Open risks

- **Plaintext SQLite** — the local database is stored in plaintext.
- **Encryption design not implemented** — an encryption design exists but has not been implemented.
- **Remaining IPC, logging, path, and SSRF hardening** — additional hardening work remains.
- **Unresolved macOS signing/notarization state** — signing/notarization must be verified for each release.

## Historical evidence

Dated engineering and testing reports are archived under `docs/archive/` and are evidence only. Relevant evidence includes:

- **Encryption design:** `docs/archive/engineering/LOCAL_DB_ENCRYPTION_DESIGN.md` — describes the encryption design; it does **not** mean encryption is implemented.
- **Signing/notarization:** `docs/archive/engineering/MACOS_SIGNING_NOTARIZATION_CHECKLIST.md` and `docs/archive/root/apple-signing-report.md` — describe signing/notarization work; they must not be used to claim signing or notarization is complete.
- **Screenshot/screen analysis:** `docs/archive/engineering/SCREENSHOT_ANALYSIS_*.md`, `docs/archive/engineering/SCREEN_UNDERSTANDING_IMPLEMENTATION_REPORT.md`, and related testing reports under `docs/archive/testing/`.
- **Testing results:** `docs/archive/testing/` contains dated E2E and test-result reports (e.g. `SCREENSHOT_ANALYSIS_TEST_COVERAGE.md`, `SCREEN_UNDERSTANDING_E2E_RESULTS.md`, `CUSTOM_MODES_E2E_RESULTS.md`). Historical test totals in these reports are not a single current number.
- **Root-level reports:** `docs/archive/root/` contains superseded root-level audit, QA, and research reports.

See [docs/archive/README.md](archive/README.md) and its engineering/testing/root indexes for the full archive policy and index.
