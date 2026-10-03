# AnswerCue Application Flow Audit

_Review date: 2026-08-20_

This document records a read-only audit of the fork's end-to-end application flow. It separates confirmed implementation risks from policy decisions and legacy cleanup. It does not override [ARCHITECTURE.md](ARCHITECTURE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md), or [TESTING.md](TESTING.md); it records findings that require remediation or owner confirmation.

## Product flow

AnswerCue is intended to provide one interview workspace across three phases:

1. **Before:** configure providers and permissions, create an interview, build prep-chat context, and attach Markdown/TXT/PDF/DOCX documents.
2. **During:** capture microphone/system audio, transcribe with Google gRPC or local Moonshine, combine transcript/prep/mode/persona/screenshot context, and stream live answers through the overlay.
3. **After:** persist the meeting, transcript, AI interactions, and RAG material, then support summaries, retrieval, and follow-up chat.

Runtime boundary is `src/` → preload `window.electronAPI` → `electron/` main process → native audio/LLM/SQLite/RAG services.

## Confirmed high-risk findings

### Data integrity and privacy

- `doNotPersist`/`meetingRetention='never'` gates final save in `MeetingPersistence`, but live RAG starts unconditionally in `electron/main.ts`. Final transcript segments can be chunked, embedded, stored, and sent to a cloud embedding provider before stop-time cleanup.
- `LLMHelper.scopesForPayload` only adds `transcript` when no extra scopes exist. Core streaming requests can carry transcript text while declaring only another scope, allowing transcript-scope denial to be bypassed.
- Placeholder meeting save and final async save use the same meeting lifecycle. With SQLite foreign keys enabled, this is not simply duplicate child rows: final `INSERT OR REPLACE` can replace the parent after RAG processing and cascade-delete fresh FK children while leaving non-FK embedding/vector residue. This requires an integration test before implementation claims are made.
- Crash recovery processes every unprocessed meeting, including the transient `live-meeting-current` RAG sentinel. A crash can create a visible phantom interview and leave transient RAG data.
- `deleteMeeting` does not fully clean embedding queues, vector tables, screenshot files, or workspace meeting references.
- `7d`/`30d` retention settings are stored but not enforced. These controls are not currently a product priority and should be hidden/removed rather than presented as working behavior.
- SQLite, workspace JSON, document JSON, and screenshot files remain plaintext. This is documented and not a new finding, but it remains a release risk.

### Runtime and contract drift

- Public STT target is Google gRPC plus local Moonshine, but preload/config still advertise unused providers and runtime contains dead provider classes. `LocalWhisper*` and `electron/audio/whisper/` are legacy names for the Moonshine path.
- Provider identifiers differ across router, preload, renderer, and model selection (`codex`/`codex-cli`, `gemini`/`gemini_flash`/`gemini_pro`). A legacy `ProviderRouter` class is instantiated but its selection/health methods appear unused.
- Overlay theme state is loaded but `AnswerCueInterface` receives `interfaceTheme="default"`, making liquid-glass/modern overlay styling inert.
- Startup/onboarding/trial components are unreachable or chained through unreachable gates. Embedded `SettingsOverlay` and popup `SettingsPopup` duplicate ownership of settings state.
- Website Mac detection routes Intel Macs to ARM downloads and unknown platforms to ARM Mac downloads. Release configuration and CI output do not fully match website asset assumptions.

## Intentional decisions recorded

- Preserve `api.natively.software`, `x-natively-key`, and legacy storage/protocol identifiers for compatibility. Do not perform a blind internal rename.
- Use Google gRPC and local Moonshine as the public STT surface. Migrate legacy Whisper naming carefully rather than changing paths without compatibility review.
- Embedded settings are canonical. Popup settings and duplicate surfaces should be retired or reduced to compatibility shells.
- Remove obsolete unreachable paths after dependency/release-use confirmation.
- Official release targets are macOS and Windows x64. Linux/IA32/extra artifact configuration is not a current support promise.
- Data/privacy remediation comes first, followed by provider/contract cleanup, then UX/release cleanup.
- Exact semantics of `doNotPersist`/`retention='never'` remain undecided. No implementation should assume strict local-only behavior or no-storage/live-answer behavior until explicitly chosen.

## Remediation order

1. Add regression/integration evidence for scope enforcement, meeting save/finalization, crash recovery, and deletion cleanup.
2. Fix confirmed data-integrity and provider-scope defects without choosing unresolved retention semantics.
3. Decide and implement the `doNotPersist` contract; remove/hide unenforced retention controls.
4. Canonicalize STT/provider IDs and migrate Moonshine naming safely.
5. Remove obsolete IPC/components and consolidate embedded settings.
6. Repair overlay theme/onboarding behavior and align website/release artifact routing.

## Evidence and plan

- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Current status: [PROJECT_STATUS.md](PROJECT_STATUS.md)
- Testing: [TESTING.md](TESTING.md)
- Repository map: [../codemap.md](../codemap.md)
- Phase 1 plan: [docs/superpowers/plans/2026-08-20-data-privacy-safety.md](superpowers/plans/2026-08-20-data-privacy-safety.md)
