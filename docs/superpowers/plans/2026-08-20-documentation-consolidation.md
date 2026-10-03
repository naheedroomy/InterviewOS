# Documentation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `README.md` plus `docs/` as AnswerCue's current documentation source of truth, archive historical reports, and remove the obsolete `openspec/` tree.

**Architecture:** Keep the repository root limited to product entry, legal, community, agent, and release-history documents. Put current technical/product guidance in focused `docs/` files, with `docs/README.md` as the navigation and ownership index. Move dated reports into labeled archive directories so evidence remains available without competing with current status.

**Tech Stack:** Markdown, Git, existing Electron/Vite/Rust project documentation, shell/Python validation commands.

**Spec:** `docs/superpowers/specs/2026-08-20-documentation-consolidation-design.md`

## Global Constraints

- No application-code changes.
- `README.md` remains the concise product and developer entry point.
- `docs/README.md` is the authoritative documentation index.
- Current implementation status belongs in `docs/PROJECT_STATUS.md`.
- Current priorities belong in `docs/ROADMAP.md`.
- Test evidence belongs in `docs/TESTING.md`; dated result reports belong in the archive.
- Release readiness belongs in `docs/RELEASE.md`; shipped history belongs in `CHANGELOG.md`.
- Archived reports are historical evidence and must be labeled as such.
- Delete the entire `openspec/` directory.
- Preserve unresolved signing, encryption, security, and live-validation gaps as unresolved.

---

### Task 1: Create documentation hub and trim root README

**Files:**
- Create: `docs/README.md`
- Modify: `README.md`

**Interfaces:**
- `README.md` links readers to `docs/README.md` for current architecture, status, roadmap, testing, release, and local STT details.
- `docs/README.md` links every canonical document created by later tasks and links root policy/community documents.

- [ ] **Step 1: Define the docs hub sections**

  `docs/README.md` must contain:

  - A one-paragraph AnswerCue description.
  - A clearly labeled “Source of truth” rule saying current guidance lives here and historical reports live under `docs/archive/`.
  - A “Current status” summary with review date `2026-08-20`, explicitly separating shipped foundations from unresolved gaps.
  - A table linking `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `ROADMAP.md`, `TESTING.md`, `RELEASE.md`, and `LOCAL_STT_ANSWERCUE_SETUP.md`.
  - Links to root `PRIVACY.md`, `SECURITY.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`.
  - An archive section linking `archive/README.md` and its engineering/testing/root indexes.
  - Maintenance rules: update the focused canonical document, record review dates, and archive dated reports.

- [ ] **Step 2: Reduce README duplication**

  Keep README sections for product purpose, high-level capabilities, privacy summary, prerequisites, development commands, and contribution/license links. Replace long status/report material with links to `docs/README.md`, `docs/PROJECT_STATUS.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, and `docs/RELEASE.md`.

- [ ] **Step 3: Validate hub and README are present**

  Run:

  ```bash
  test -f README.md && test -f docs/README.md
  ```

  Expected: exit code `0`. Full canonical-file and link-target validation runs in Task 6 after later docs exist.

- [ ] **Step 4: Commit hub changes**

  ```bash
  git add README.md docs/README.md
  git commit -m "docs: add canonical documentation hub"
  ```

### Task 2: Write architecture and current-status documents

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/PROJECT_STATUS.md`

**Interfaces:**
- `docs/ARCHITECTURE.md` describes the current system boundaries and data/control flow without inventing unsupported components.
- `docs/PROJECT_STATUS.md` is the only current implementation-status summary and links dated evidence in `docs/archive/`.

- [ ] **Step 1: Write architecture overview**

  Cover Electron main process, preload bridge, renderer/Vite UI, Rust native module, local Moonshine STT, LLM provider routing, SQLite persistence, document ingestion/RAG, screenshot/screen context, update/licensing services, and premium-module boundaries.

- [ ] **Step 2: Document core flows**

  Include concise numbered flows for startup/window management, audio-to-transcript-to-LLM response, document-to-RAG context, screenshot capture-to-analysis, and persistence. Name `electron/main.ts`, `electron/ipcHandlers.ts`, `electron/audio/nativeModuleLoader.ts`, and `electron/llm/ProviderRouter.ts` as implementation anchors where accurate.

- [ ] **Step 3: Document trust boundaries**

  Explain renderer/main IPC, native audio, local storage, selected external LLM providers, optional cloud STT, and licensing/network calls. State that local STT does not mean prompts, transcripts, documents, or screenshots stay local when an external provider is selected.

- [ ] **Step 4: Write current status**

  Add review date `2026-08-20`. Separate:

  - Shipped foundations: Electron app, provider routing, local transcription support, audio capture, document ingestion, RAG/interview persistence, screenshot context, custom modes, and post-interview workflows.
  - Verification status: automated coverage exists, but live Electron/audio/manual and complete Playwright validation remain incomplete.
  - Open risks: plaintext SQLite, encryption design not implemented, remaining IPC/log/path/SSRF hardening, and unresolved macOS signing/notarization state.
  - Historical evidence links rather than duplicated report prose.

- [ ] **Step 5: Check status language for overclaims**

  Run:

  ```bash
  rg -n "complete|fully secure|production ready|all tests pass|notarized|encrypted" docs/ARCHITECTURE.md docs/PROJECT_STATUS.md
  ```

  Replace any absolute claim that conflicts with the documented unresolved gaps.

- [ ] **Step 6: Commit architecture/status docs**

  ```bash
  git add docs/ARCHITECTURE.md docs/PROJECT_STATUS.md
  git commit -m "docs: document architecture and project status"
  ```

### Task 3: Consolidate roadmap, testing, and release guidance

**Files:**
- Create: `docs/ROADMAP.md`
- Create: `docs/TESTING.md`
- Modify: `docs/RELEASE.md`
- Modify: `docs/LOCAL_STT_ANSWERCUE_SETUP.md`

**Interfaces:**
- `docs/ROADMAP.md` contains current priorities only and links status evidence where needed.
- `docs/TESTING.md` contains repeatable commands and manual validation boundaries.
- `docs/RELEASE.md` is the current packaging/signing/notarization checklist.
- `docs/LOCAL_STT_ANSWERCUE_SETUP.md` remains the focused local-STT setup guide and links back to the docs hub.

- [ ] **Step 1: Replace stale roadmap**

  Create `docs/ROADMAP.md` with sections for current priorities, near-term reliability/security work, validation work, and deferred ideas. Carry forward only priorities supported by current engineering evidence: live Electron/audio validation, Playwright E2E, IPC/path/SSRF/log hardening, database encryption, provider/Gemini/Google-STT integration completion, and macOS release readiness. Put older token/mobile/collaboration/plugin ideas under a clearly labeled deferred section or archive reference.

- [ ] **Step 2: Write testing guide**

  Document the repository commands from `AGENTS.md`: `npm test`, `npm run build:electron`, native build requirements, Vite browser smoke-test setup, and the Electron/manual checklist. Distinguish unit/integration tests from live Electron, real audio, screen capture, and Playwright coverage. Do not collapse historical “349” and “371” report totals into one current number; link those reports as historical evidence.

- [ ] **Step 3: Refresh release guide**

  Update `docs/RELEASE.md` to state current build/package commands, platform prerequisites, signing identity/hardened-runtime/notarization requirements, artifact checks, release-note requirements, and known limitation handling. Explicitly mark signing/notarization as “verify for each release” unless current repository evidence proves otherwise.

- [ ] **Step 4: Refresh local STT guide**

  Add a link to `docs/README.md`, current prerequisites, setup commands, supported local-model behavior, troubleshooting, and the distinction between local speech recognition and external LLM data transfer.

- [ ] **Step 5: Commit roadmap/testing/release docs**

  ```bash
  git add docs/ROADMAP.md docs/TESTING.md docs/RELEASE.md docs/LOCAL_STT_ANSWERCUE_SETUP.md
  git commit -m "docs: consolidate roadmap testing and release guidance"
  ```

### Task 4: Archive historical reports and add archive indexes

**Files:**
- Create: `docs/archive/README.md`
- Create: `docs/archive/engineering/README.md`
- Create: `docs/archive/testing/README.md`
- Create: `docs/archive/root/README.md`
- Move: all tracked files under `docs/engineering/` to `docs/archive/engineering/`
- Move: all tracked files under `docs/testing/` to `docs/archive/testing/`
- Move: `AUDIT.md`, `AUDIO_RELIABILITY_REPORT.md`, `CROSS_PLATFORM_AUDIT.md`, `CROSS_PLATFORM_REVIEW.md`, `QA_REPORT.md`, `QAautomationprompt.md`, `answercue-market-research.md`, `comparisonreport.md`, `fixreport.md`, `promptfix.md`, `report.md`, `tinypromptsreport.md`, `visionpipelineresearch.md`, `visionupgrade.md`, `changes.md`, and `apple-signing-report.md` to `docs/archive/root/`
- Preserve root: `README.md`, `CHANGELOG.md`, `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md`, `termsandcondition.md`, and `refund.md`

**Interfaces:**
- Archive indexes state that archived files are historical evidence, not active requirements.
- `docs/README.md` links archive indexes and canonical replacements.
- Historical paths may change; no application import or runtime path may change.

- [ ] **Step 1: Create archive indexes**

  `docs/archive/README.md` must explain archive policy and link each sub-index. Each sub-index must name its source area, state that reports are historical, and link to the canonical replacement documents.

- [ ] **Step 2: Move engineering and testing reports**

  Use Git moves so history is preserved:

  ```bash
  mkdir -p docs/archive/engineering docs/archive/testing docs/archive/root
  git mv docs/engineering/*.md docs/archive/engineering/
  git mv docs/testing/*.md docs/archive/testing/
  ```

- [ ] **Step 3: Move root reports**

  Move exactly the listed root report files into `docs/archive/root/`. Do not move legal, community, policy, changelog, or agent instruction files.

- [ ] **Step 4: Label legacy material**

  Add a short archive banner to each archive index, not to every report, stating that filenames retain historical context and claims must not override canonical docs. Preserve legacy Natively references inside archived reports when historically accurate.

- [ ] **Step 5: Search active docs for stale branding and paths**

  Run:

  ```bash
  rg -n -i "natively|nativelyapi|natively\.dmg|openspec/" README.md docs --glob '*.md' --glob '!docs/archive/**' --glob '!docs/superpowers/**'
  ```

  Remove or replace matches in active guidance. Leave only intentional historical/planning references excluded by the command.

- [ ] **Step 6: Commit archive migration**

  ```bash
  git add README.md docs
  git commit -m "docs: archive historical reports"
  ```

### Task 5: Remove obsolete OpenSpec artifacts

**Files:**
- Delete: entire `openspec/` directory, including all proposals, designs, tasks, and delta specs.

**Interfaces:**
- No active documentation links to `openspec/`.
- Future planning artifacts are created afresh when needed; this task adds no replacement planning framework.

- [ ] **Step 1: Confirm deletion target**

  Run:

  ```bash
  git ls-files openspec/
  ```

  Expected: only the obsolete OpenSpec files are listed; no source or runtime files are under this path.

- [ ] **Step 2: Delete the tree**

  ```bash
  git rm -r openspec
  ```

- [ ] **Step 3: Confirm no active references**

  Run:

  ```bash
  rg -n "openspec/" README.md docs --glob '*.md' --glob '!docs/superpowers/**' --glob '!docs/archive/**' || true
  test ! -e openspec
  ```

  Expected: no active-document matches and `openspec` absent.

- [ ] **Step 4: Commit deletion**

  ```bash
  git commit -m "chore: remove obsolete openspec artifacts"
  ```

### Task 6: Validate documentation-only migration

**Files:**
- Verify: all changed files on the branch.

- [ ] **Step 1: Check working tree and diff scope**

  ```bash
  git status --short
  git diff origin/main...HEAD --name-status
  git diff origin/main...HEAD --check
  ```

  Expected: only Markdown/documentation moves/deletions and the intentional OpenSpec deletion appear; no application source, package, lockfile, or generated binary changes appear.

- [ ] **Step 2: Verify canonical links and files**

  ```bash
  for file in README.md docs/README.md docs/ARCHITECTURE.md docs/PROJECT_STATUS.md docs/ROADMAP.md docs/TESTING.md docs/RELEASE.md docs/LOCAL_STT_ANSWERCUE_SETUP.md PRIVACY.md SECURITY.md CHANGELOG.md CONTRIBUTING.md CODE_OF_CONDUCT.md; do test -f "$file" || exit 1; done
  ```

- [ ] **Step 3: Verify archive and OpenSpec state**

  ```bash
  test -f docs/archive/README.md
  test -f docs/archive/engineering/README.md
  test -f docs/archive/testing/README.md
  test -f docs/archive/root/README.md
  test ! -e openspec
  ```

- [ ] **Step 4: Verify active-document policy**

  ```bash
  ! rg -n -i "natively|nativelyapi|natively\.dmg" README.md docs --glob '*.md' --glob '!docs/archive/**' --glob '!docs/superpowers/**'
  ! rg -n "openspec/" README.md docs --glob '*.md' --glob '!docs/archive/**' --glob '!docs/superpowers/**'
  ```

- [ ] **Step 5: Run proportionate repository checks**

  ```bash
  npm test
  npm run build:electron
  ```

  These checks confirm documentation changes did not disturb repository scripts or build metadata. Record any pre-existing/environment-specific failure without changing application code.

- [ ] **Step 6: Review final history and status**

  ```bash
  git log --oneline origin/main..HEAD
  git status --short --branch
  ```

  Expected: branch `docs/consolidate-documentation`, clean working tree, and commits grouped by canonical docs, archive migration, and OpenSpec removal.
