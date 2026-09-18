# InterviewOS Comprehensive Engineering & Product Report

**Date:** September 2026  
**Product:** InterviewOS  
**Current Release:** v3.2.0  
**Repository:** `naheedroomy/InterviewOS`  
**License:** Proprietary / Commercial  

---

## Executive Summary

Over the course of this development cycle, the application underwent a full-scale evolution—transforming from a flat, ephemeral meeting assistant (**AnswerCue**) into **InterviewOS**, an executive-grade desktop operating system designed for end-to-end technical and behavioral interview performance.

Key transformations achieved:
1. **Architectural Paradigm Shift:** Migrated from ephemeral single-session meeting states to first-class persistent **Interview Workspaces** and multi-round interview runs with atomic file-system persistence.
2. **Design System & Craft Overhaul:** Purged AI design anti-patterns ("slop") and instituted the **Executive Charcoal & Warm Amber** design system adhering strictly to the Impeccable craft floor.
3. **Dedicated Knowledge Bank Hub & Staging:** Built a full-screen, searchable document repository with cross-workspace reference tracking, multi-file staged upload classification, and inline active context management.
4. **Reactive Document Synchronization:** Implemented an asynchronous cross-window IPC event bus ensuring uploaded documents reflect immediately across workspaces and attachment modals with zero stale state.
5. **Brand Identity & 3D Gold Icon Suite:** Handcrafted a 3D metallic gold squircle emblem across macOS (`.icns` with full Retina @2x scaling), Windows (`.ico`), Linux, and the web, supported by an automated generation pipeline. Complete purge of legacy branding across the app, marketing site, and legal documents.
6. **Release Engineering & Apple Silicon Parity:** Resolved cross-compilation target gaps in `package.json`, packaged native Apple Silicon (`arm64`) DMGs alongside Intel (`x64`) installers, verified multi-architecture download routing on the marketing website, and published release **v3.2.0**.

---

## Chronological Milestone Breakdown

### Milestone 1: Persistent Interview Chats & Multi-Round Engine (v2.9.0)

#### Architectural Motivation
Previously, the application treated interviews as ephemeral single-session transcripts. When a candidate finished an interview or closed the window, context and prep history were wiped or poorly indexed.

#### Key Deliverables
- **Domain Models (`InterviewWorkspace` & `InterviewRound`):**
  - Designed persistent data structures capturing workspace metadata (`id`, `title`, `company`, `role`, `createdAt`, `updatedAt`, `modelOverride`, `candidateNotes`, `aiInstructions`), active round pointers, and associated context documents.
  - Multi-round tracking: Candidate sessions can now branch across technical screens, system design rounds, and behavioral loops while preserving core company context.
- **Atomic Persistence Manager (`InterviewWorkspaceStateManager.ts`):**
  - Replaced naive file writes with atomic staging (`.tmp` write followed by atomic rename) to protect candidate data from unexpected power loss or crashes.
  - Integrated LRU caching and asynchronous background disk flushing.
- **Round Switcher Header & "Start Next Round" Flow:**
  - Built an inline header pill bar showing completed rounds (`✓`), in-progress rounds (`🟢`), and a `+ Next Round` action with inline renaming.
  - Seamless round transitions: automatically retains company context documents, resets the prep chat and live timeline, and creates a fresh round workspace.
- **Dedicated Context Documents Panel:**
  - Replaced the legacy floating popover composer with a dedicated right-hand drawer supporting drag-and-drop document ingestion, file kind badges (`Resume`, `Job Description`, `Notes`), and one-click detachment.
- **Sidebar Workspace Navigation:**
  - Redesigned sidebar listing all interview workspaces with double-click inline renaming (`Enter` to save, `Esc` to cancel), context menus (`•••`), and round counters.

---

### Milestone 2: Rebrand & Executive Design Overhaul (v3.0.0)

#### Design Tokens & Impeccable Craft Floor
A complete audit using the Impeccable craft floor detector purged standard AI application clichés:
- **Purged Slop Patterns:**
  - ❌ Removed all `background-clip: text` gradient text fills.
  - ❌ Replaced bouncy spring easing curves (`cubic-bezier(0.34, 1.56, 0.64, 1)`) with crisp exponential deceleration curves (`cubic-bezier(0.16, 1, 0.3, 1)`).
  - ❌ Replaced decorative hairline grid-line backgrounds with solid, distraction-free matte canvas backgrounds.
  - ❌ Replaced arbitrary border radius stacks with standardized squircle tokens.
- **Executive Charcoal & Warm Amber Theme (`src/index.css`):**
  - `--bg-canvas: #121214` (deep executive charcoal)
  - `--bg-surface: #16161a` (subtle contrast panels)
  - `--bg-card: #1c1c21` (elevated interaction containers)
  - `--amber-primary: #f59e0b` / `--amber-hover: #d97706` (warm amber focal points)
  - Custom dark scrollbars and high-contrast text selection styling.

#### Dedicated Full-Screen Knowledge Bank Hub
- Replaced the drawer with a dedicated full-screen repository (`[ 📚 Knowledge Bank ]`).
- Candidates can ingest and preview resumes, system design cheat sheets, and job specifications.
- **Cross-Interview Usage Badges:** Electron IPC endpoint `knowledge-bank:get-document-usage` tracks document references across all workspaces (`Used in: Google, Stripe`), warning candidates before deleting documents in active use.

#### Per-Interview Role & AI Persona Overrides
- Added `[ ⚡ Role & Persona ]` configuration per interview workspace.
- Allows candidates to inject specific background context (e.g., "Staff Backend Engineer, 8 YoE, Distributed Systems") and target AI behavior instructions.
- Dynamically synchronizes directly with `LLMHelper` without requiring an application restart.

---

### Milestone 3: Search Ergonomics, Staged Uploads & Model Control (v3.1.0)

#### Spotlight Search Overlay (⌘K)
- Redesigned the top search bar: previously a wide, static input that encroached on navigation tabs.
- Converted into a compact, in-flow pill with a `⌘K` shortcut badge.
- Clicking or pressing `⌘K` triggers a centered **Spotlight modal** with backdrop blur, live query highlighting, and keyboard arrow navigation.

#### Multi-File Staged Upload Flow (`UploadStagingModal.tsx`)
- Candidates can drop multiple files simultaneously into either the Knowledge Bank or interview chat dropzones.
- Staging modal analyzes files, auto-detects file kinds (`Resume`, `Job Spec`, `Cover Letter`, `Interview Prep Kit`, `Cheat Sheet`, `Notes`, `Portfolio`), and allows custom descriptions before committing batch ingestion.

#### Prominent Per-Interview AI Model Selector
- Restored an explicit, accessible model selector in the interview header adjacent to the persona trigger.
- Selected model is persisted per interview (`modelOverride`) and restored automatically upon switching workspaces.
- **Gemini Model Filtering:** Stripped out experimental test models containing `banana` and `nano` across backend IPC handlers and renderer selection menus.

---

### Milestone 4: Reactive Synchronization & 3D Gold App Icon (v3.2.0)

#### Reactive Knowledge Bank Synchronization
- **Problem:** Newly uploaded documents in the Knowledge Bank were not immediately visible when opening an interview workspace or clicking "Attach from Knowledge Bank" due to state staleness across IPC boundaries.
- **Solution:**
  - Added a global cross-window IPC event bus broadcasting `interview-docs:changed` whenever files are added, modified, or detached.
  - Wired real-time listeners in `Launcher.tsx`, `ContextDocumentsPanel.tsx`, and the Attach Modal.
  - Added an active loading spinner and an "Already Attached" badge list for attached documents.

#### 3D Metallic Gold App Icon Suite
- **Visual Design:** Handcrafted 3D metallic gold squircle emblem with a chamfered rim, micro-textured charcoal face, and transparent corner anti-aliasing (derived from `iOS.jpeg`).
- **Platform Packaging:**
  - **macOS:** Multi-resolution `.icns` containing 16×16 up to 1024×1024 Retina assets with full `@2x` high-DPI scaling.
  - **Windows:** Multi-image `.ico` (16px, 24px, 32px, 48px, 64px, 128px, 256px).
  - **Linux:** Clean PNG suite.
  - **Web & Frontend:** Favicon (`icon.png`, `favicon.ico`, `apple-touch-icon.png`) and SVG vector representations.
- **Automated Pipeline:** Built `scripts/generate-app-icons.mjs` (`npm run icons:generate`) using `sharp` to programmatically generate and package the entire asset tree.

#### Complete Brand Purge
- Removed all legacy "AnswerCue" references from:
  - Application source files, dialogs, modals, and titles.
  - Legal documentation: `termsandcondition.md` and `refund.md`.
  - Marketing website (`website/app/`, `website/components/`, `website/lib/`).
  - Packaging files and permissions scripts (`scripts/reset-mac-permissions.sh`).

---

### Milestone 5: Release Engineering & Apple Silicon (arm64) Delivery

#### Root Cause Analysis of Missing Apple Silicon Release
- In `package.json`, electron-builder's macOS DMG configuration was hardcoded to:
  ```json
  "mac": {
    "target": [
      { "target": "zip", "arch": ["x64", "arm64"] },
      { "target": "dmg", "arch": ["x64"] }
    ]
  }
  ```
  Only the Intel (`x64`) DMG was produced during release builds.
- The 660MB Apple Silicon `.zip` archive encountered network upload timeouts on earlier CI/CLI publish attempts, leaving GitHub Release `v3.2.0` with only Intel assets.

#### Resolution & Verification
1. **Config Update:** Added `"arm64"` to the DMG target architectures in `package.json` ([commit `c10905e`](https://github.com/naheedroomy/InterviewOS/commit/c10905e)).
2. **Packaging:** Built `InterviewOS-3.2.0-arm64.dmg` (635 MB) with verified Mach-O 64-bit arm64 binary payload and standard `/Applications` drag-and-drop installer layout.
3. **Release Publishing:** Uploaded all release assets directly to GitHub Release `v3.2.0`:
   - 🍏 **Apple Silicon DMG:** `InterviewOS-3.2.0-arm64.dmg` (635 MB)
   - 🍏 **Apple Silicon ZIP:** `InterviewOS-3.2.0-arm64-mac.zip` (662 MB)
   - 💻 **Intel DMG:** `InterviewOS-3.2.0.dmg` (672 MB)
   - 💻 **Intel ZIP:** `InterviewOS-3.2.0-mac.zip` (669 MB)
   - Auto-updater metadata and blockmaps (`latest-mac.yml`, `.blockmap` files).
4. **Website Compatibility:** Tested and verified the platform asset resolver in `website/lib/github.ts`:
   - Evaluated `pickAsset(assets, 'mac-arm')` → correctly resolves `InterviewOS-3.2.0-arm64.dmg`.
   - Evaluated `pickAsset(assets, 'mac-intel')` → correctly resolves `InterviewOS-3.2.0.dmg`.

---

## Codebase Architecture Summary

```
InterviewOS/
├── assets/icons/                 # 3D Gold Icon suite (.icns, .ico, PNGs)
├── docs/                         # Architecture specifications and implementation plans
├── electron/
│   ├── audio/                    # Core audio capture & loopback drivers
│   ├── ipcHandlers.ts            # Typed IPC endpoints (workspaces, docs, models)
│   ├── llm/                      # Multi-provider LLM integrations (Claude, OpenAI, Gemini)
│   ├── main.ts                   # App lifecycle, single-instance lock, auto-updater
│   ├── preload.ts                # Context bridge exposing typed window.electronAPI
│   └── services/
│       ├── InterviewWorkspaceStateManager.ts  # Atomic workspace persistence
│       └── KnowledgeBankService.ts            # Vector embeddings & document store
├── scripts/
│   ├── generate-app-icons.mjs    # Multi-platform icon build pipeline
│   ├── reset-mac-permissions.sh  # macOS TCC permissions reset tool
│   └── ad-hoc-sign.js            # Electron afterPack codesign helper
├── src/
│   ├── components/
│   │   ├── Launcher.tsx          # Main application shell, sidebar & round switcher
│   │   ├── ContextDocumentsPanel.tsx  # Document drawer & attachment manager
│   │   ├── KnowledgeBank.tsx     # Full-screen Knowledge Bank repository
│   │   ├── UploadStagingModal.tsx# Multi-file upload staging & classification
│   │   ├── TopSearchPill.tsx     # Compact search pill & ⌘K Spotlight overlay
│   │   └── ui/ModelSelector.tsx  # Per-interview model picker
│   └── index.css                 # Executive Charcoal & Amber design tokens
└── website/                      # Next.js marketing website & dynamic download router
```

---

## Quality & Verification Gates

All changes across this cycle strictly met the following automated quality thresholds:

| Quality Gate | Command | Result |
| :--- | :--- | :--- |
| **TypeScript Compilation** | `npx tsc --noEmit -p tsconfig.json` | **0 Errors** |
| **React Doctor Linting** | `npm run doctor` (`react-doctor src`) | **0 Errors** |
| **Impeccable Anti-Slop** | `impeccable detect --json src` | **0 Warnings** |
| **Unit Test Suite** | `node --test 'electron/services/__tests__/*.test.mjs'` | **10 / 10 Passing (100%)** |
| **Electron Main Build** | `npm run build:electron` | **Clean Exit (Code 0)** |
| **Binary Verification** | `file release/mac-arm64/.../InterviewOS` | **Mach-O 64-bit arm64 Verified** |

---

## Deliverables & Links

- **GitHub Release v3.2.0:** [https://github.com/naheedroomy/InterviewOS/releases/tag/v3.2.0](https://github.com/naheedroomy/InterviewOS/releases/tag/v3.2.0)
- **Direct Downloads:**
  - 🍏 [InterviewOS-3.2.0-arm64.dmg](https://github.com/naheedroomy/InterviewOS/releases/download/v3.2.0/InterviewOS-3.2.0-arm64.dmg) (Apple Silicon M1/M2/M3/M4)
  - 💻 [InterviewOS-3.2.0.dmg](https://github.com/naheedroomy/InterviewOS/releases/download/v3.2.0/InterviewOS-3.2.0.dmg) (Intel x86_64)
- **Main Branch Commit:** [`c10905e`](https://github.com/naheedroomy/InterviewOS/commit/c10905e)
