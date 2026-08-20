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
- **Post-interview workflows** — continuing the conversation with prep chat, selected docs, transcript, and generated AI responses available as context (subject to context token-budget limits).

## Verification status

- **Automated coverage exists** — unit/integration tests run via `npm test` (see [TESTING.md](TESTING.md) for supported commands and layers).
- **Live Electron/audio/manual validation remains incomplete** — real-window, real-audio, and screen-capture validation is not yet complete.
- **Complete Playwright validation remains incomplete** — browser-only smoke tests exist, but full end-to-end Playwright coverage is not complete.

## Open risks

- **Plaintext SQLite** — the local database is stored in plaintext.
- **Encryption design not implemented** — an encryption design exists but has not been implemented.
- **Remaining IPC, logging, path, and SSRF hardening** — additional hardening work remains.
- **Gemini and Google-STT integration completion** — provider and Google speech-to-text integration work remains unresolved.
- **Unresolved macOS signing/notarization state** — signing/notarization must be verified for each release.

## Historical evidence

Dated engineering and testing reports are archived under `docs/archive/` and are evidence only. Relevant evidence includes:

- **Encryption design:** [LOCAL_DB_ENCRYPTION_DESIGN.md](archive/engineering/LOCAL_DB_ENCRYPTION_DESIGN.md) — describes the encryption design; it does **not** mean encryption is implemented.
- **Signing/notarization:** [MACOS_SIGNING_NOTARIZATION_CHECKLIST.md](archive/engineering/MACOS_SIGNING_NOTARIZATION_CHECKLIST.md) and [apple-signing-report.md](archive/root/apple-signing-report.md) — describe signing/notarization work; they must not be used to claim signing or notarization is complete.
- **Screenshot/screen analysis:** the [engineering archive index](archive/engineering/README.md) lists the `SCREENSHOT_ANALYSIS_*` reports and [SCREEN_UNDERSTANDING_IMPLEMENTATION_REPORT.md](archive/engineering/SCREEN_UNDERSTANDING_IMPLEMENTATION_REPORT.md); related testing reports are under the [testing archive index](archive/testing/README.md).
- **Testing results:** the [testing archive index](archive/testing/README.md) lists dated E2E and test-result reports (e.g. [SCREENSHOT_ANALYSIS_TEST_COVERAGE.md](archive/testing/SCREENSHOT_ANALYSIS_TEST_COVERAGE.md), [SCREEN_UNDERSTANDING_E2E_RESULTS.md](archive/testing/SCREEN_UNDERSTANDING_E2E_RESULTS.md), [CUSTOM_MODES_E2E_RESULTS.md](archive/testing/CUSTOM_MODES_E2E_RESULTS.md)). Historical test totals in these reports are not a single current number.
- **Root-level reports:** the [root archive index](archive/root/README.md) lists superseded root-level audit, QA, and research reports.

See [docs/archive/README.md](archive/README.md) and its engineering/testing/root indexes for the full archive policy and index.
