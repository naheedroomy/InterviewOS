# Documentation Consolidation Design

## Status

Approved design for implementation on `docs/consolidate-documentation`.

## Problem

AnswerCue documentation is split between the repository root, `docs/engineering/`,
`docs/testing/`, release notes, and historical reports. Several documents describe
older product names, test results, roadmaps, and packaging states. Readers cannot
reliably tell which document is current.

The old `openspec/` tree is no longer an active planning system and should be
removed. Future changes will use newly created planning artifacts.

## Goals

- Make `README.md` the concise product and developer entry point.
- Make `docs/README.md` the authoritative documentation index.
- Define focused current documents for architecture, status, roadmap, testing,
  security/privacy, release, and local STT setup.
- Preserve useful historical evidence without presenting it as current guidance.
- Remove stale OpenSpec artifacts by deleting the entire `openspec/` directory.
- Establish explicit rules for updating canonical documentation.
- Remove or redirect stale root-level project reports and duplicate roadmap content.

## Non-goals

- No application-code changes.
- No rewrite of historical reports for cosmetic consistency.
- No claim that unresolved engineering work is complete.
- No new planning framework to replace OpenSpec in this change.

## Canonical information architecture

### Repository root

Keep root files that are standard project entry points, legal/community documents,
or release history:

- `README.md` — product summary, supported workflows, setup, development commands,
  and links into `docs/`.
- `CHANGELOG.md` — chronological shipped release history.
- `PRIVACY.md` and `SECURITY.md` — public policy and vulnerability-reporting docs.
- `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` — contributor guidance.
- `AGENTS.md` — agent/repository operating instructions.

Move root analysis, audit, QA, research, and temporary report files into the
historical archive unless their current facts are promoted into canonical docs.

### `docs/`

Create or maintain these current documents:

- `docs/README.md` — source-of-truth index, document ownership, update rules, and
  current-state summary.
- `docs/ARCHITECTURE.md` — Electron/Vite/Rust/native-audio architecture, process
  boundaries, IPC, provider routing, persistence, transcription, screenshots, and
  RAG flow.
- `docs/PROJECT_STATUS.md` — verified shipped capabilities, known gaps, validation
  state, and date of last review.
- `docs/ROADMAP.md` — current priorities only; no inherited roadmap items without
  an explicit current decision.
- `docs/TESTING.md` — supported test commands, test layers, manual Electron checks,
  and known coverage limitations.
- `docs/RELEASE.md` — build, signing, notarization, packaging, and release checklist.
- `docs/LOCAL_STT_ANSWERCUE_SETUP.md` — local transcription setup and troubleshooting.

Root `PRIVACY.md` and `SECURITY.md` remain canonical policy documents. `docs/README.md`
links to them and records implementation status separately, so policy and engineering
status do not become mixed.

### `docs/archive/`

Move historical engineering/testing reports and superseded root reports under:

- `docs/archive/engineering/`
- `docs/archive/testing/`
- `docs/archive/root/`

Each archive directory gets an index stating that files are historical evidence, not
current requirements or status. Historical filenames remain intact where practical;
path changes are acceptable because these reports are not public API.

## Source-of-truth rules

1. Current product behavior belongs in `README.md` only at overview/setup level and
   in the focused `docs/` document for deeper detail.
2. Current implementation status belongs in `docs/PROJECT_STATUS.md`.
3. Current priorities belong in `docs/ROADMAP.md`.
4. Test evidence belongs in `docs/TESTING.md`; dated result reports belong in the
   archive.
5. Release readiness belongs in `docs/RELEASE.md`; changelog entries describe what
   shipped, not what remains blocked.
6. Archived reports must be labeled historical and must not override canonical docs.
7. Every canonical status document records a review date.
8. New documentation must link from `docs/README.md` or be placed in the archive.

## Migration

1. Create canonical docs from verified content in the current README, privacy/security
   docs, engineering reports, testing reports, release checklist, and CodeGraph
   architecture findings.
2. Resolve conflicting claims explicitly. For example, report differing test totals
   as historical figures and state what is currently verified.
3. Mark unresolved signing/notarization and encryption work as unresolved rather than
   inheriting an older report's conclusion.
4. Move stale root reports and historical engineering/testing files to the archive.
5. Remove `openspec/` entirely.
6. Search for stale Natively branding and old paths in active user/developer guidance;
   retain legacy references in changelog entries, planning artifacts, and clearly
   historical archive files when needed for historical accuracy.
7. Validate links, paths, headings, and repository status before completion.

## Validation

- Every canonical document is linked from `docs/README.md`.
- README links resolve to existing files.
- No active user/developer guidance references `openspec/` or stale Natively installer
  names. Planning artifacts and historical records are exempt when they describe
  their own history.
- Archive indexes identify historical documents.
- `openspec/` no longer exists.
- Git diff contains documentation-only changes plus the intentional OpenSpec deletion.
- Existing application tests are not required because application code is unchanged;
  run repository/documentation checks available in the project.
