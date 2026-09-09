# Design Specification: InterviewOS — Modern UI Overhaul, Knowledge Bank & Persona Overrides

_Date: 2026-09-09_  
_Status: Draft_  
_Target Release: InterviewOS 2.10.0_

---

## 1. Overview & Objectives

AnswerCue is being fully rebranded and modernized into **InterviewOS**. This specification outlines the architectural overhaul across three primary pillars:
1. **Rebrand & Aesthetic Overhaul:** Replace the legacy blue styling and generic controls with a high-contrast, premium **Executive Charcoal & Warm Amber** design system inspired by tools like Raycast and Linear.
2. **Dedicated Knowledge Bank:** Introduce a top-rail navigation switch (`[ 💬 Interviews ]` and `[ 📚 Knowledge Bank ]`) providing a central, permanent document library for master resumes, system design cheat-sheets, brag sheets, and company research.
3. **Streamlined Chat Context & Per-Interview Persona Overrides:** Remove the right-panel drawer from the interview view and replace it with an inline "Active Context" strip. Add the ability to override global candidate background instructions and AI persona tone on a per-interview basis.

---

## 2. Design System: Executive Charcoal & Warm Amber

### Color Palette
- **Backgrounds:**
  - Base canvas: `#121214`
  - Sidebar / Surfaces: `#16161a`
  - Cards & Input Fields: `#1c1c21`
  - Popovers & Modals: `#202026`
- **Accents (Amber):**
  - Primary Accent: `#f59e0b` (Amber 500)
  - Hover Accent: `#fbbf24` (Amber 400)
  - Subtle Tints: `rgba(245, 158, 11, 0.12)` (badges, active pill backgrounds)
  - Amber Border: `rgba(245, 158, 11, 0.35)`
- **Borders:**
  - Subtle hairline borders: `rgba(255, 255, 255, 0.07)`
  - Elevated borders: `rgba(255, 255, 255, 0.12)`
- **Typography:**
  - High-contrast text primary: `#fafafa`
  - Secondary text: `#a1a1aa`
  - Tertiary / Muted text: `#71717a`
- **Semantic Accents:**
  - Success / Completed round: `#10b981` (Emerald)
  - Live Recording / Audio: `#ef4444` (Pulsing Red)
  - Active Round selection: `#f59e0b` (Warm Amber)

### Micro-Interactions
- Crisp 1px borders with subtle inner highlights.
- Clear keyboard focus rings (`focus-visible:ring-1 focus-visible:ring-amber-500/50`).
- Seamless transitions with 120ms–150ms ease curves.

---

## 3. Primary Navigation Architecture

`Launcher.tsx` will feature a unified top navigation rail:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [⚡ InterviewOS]         [ 💬 Interviews ]   [ 📚 Knowledge Bank ]        [⚙️] │
├──────────────────────────┬───────────────────────────────────────────────┤
│ Left Sidebar (Interviews)│ Active Screen                                 │
│                          │                                               │
│ • Google — Staff Backend │ (Displays either the Interview Chat Workspace │
│ • Stripe — Infra Lead    │  or the full-page Knowledge Bank Hub)         │
│ • Meta — E5 Product      │                                               │
└──────────────────────────┴───────────────────────────────────────────────┘
```

- **Top Rail Segmented Switcher:**
  - `[ 💬 Interviews ]`: Shows the active interview chat workspace, round switcher, prep timeline, and live meeting controls.
  - `[ 📚 Knowledge Bank ]`: Transitions the main area to the full-page document library.
- **Brand Logo:** Updated from "AnswerCue" to "InterviewOS" with a distinct amber badge.
- **Top Right Actions:** Quick access to audio/permissions readiness status and the global Settings modal (`⚙️`).

---

## 4. Dedicated Knowledge Bank Subsystem

### Purpose
Allows candidates to maintain master documents (master resume versions, system design cheat-sheets, behavioral story banks, and company profiles) in one permanent location without needing to re-upload them across different interviews.

### Component Architecture: `src/components/KnowledgeBankView.tsx`
- **Header & Stats:**
  - Total document count, total storage size, and quick search bar.
  - Primary button: `＋ Upload to Knowledge Bank`.
- **Drag-and-Drop Dropzone:**
  - Clean dashed dropzone accepting `.pdf`, `.docx`, `.txt`, `.md`.
  - Automatically parses text, extracts metadata (word count, kind: Resume, Job Description, Technical Notes), and saves to `InterviewContextManager`.
- **Document Cards & Grid:**
  - Document icon (styled according to file type).
  - Title, formatted byte size, upload date.
  - **Usage Badge:** Shows which interviews are actively referencing the file (e.g. `Used in: Google (Round 1 & 2), Stripe`).
  - **Document Actions Menu (`•••`):**
    - View/Preview parsed text content.
    - Delete document (with confirmation dialog warning if linked to active interviews).

---

## 5. Interview Chat & "Active Context" Strip

### Removal of Right Drawer
The narrow, cumbersome right drawer in `Launcher.tsx` is completely removed. All master document management lives in the Knowledge Bank, while interview-specific attachments are kept minimal and lightweight directly inside the chat.

### Active Context Strip
Located directly underneath the Round Switcher in the interview main header:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Round 1: Recruiter Screen (✓)   Round 2: System Design (🟢)   [ + Next Round ]│
├──────────────────────────────────────────────────────────────────────────────┤
│ 📎 Active Context: [📄 Staff_Resume.pdf ✕] [📋 Google_JD.pdf ✕] [+ Attach]   │
└──────────────────────────────────────────────────────────────────────────────┘
```
- **Attached Document Pills:** Displays each document linked to `selectedWorkspace.documentIds`.
- **Detach Control (`✕`):** Detaches the document from this interview workspace. Does **not** delete the document from the Knowledge Bank.
- **`+ Attach from Knowledge Bank` Button:** Opens a modal dialog listing all documents from the Knowledge Bank with checkboxes to attach/detach in one click.
- **Direct Drag-and-Drop into Chat:** Candidates can drag and drop a file directly into the interview chat area; it is automatically added to the Knowledge Bank *and* attached to the current interview.

---

## 6. Per-Interview Custom Instructions & AI Persona Overrides

### Conceptual Model
1. **Candidate Background (Custom Instructions):** *Who you are* — facts, years of experience, specific accomplishments, and tech stack details.
2. **AI Persona (Response Style):** *How the AI answers* — tone, brevity, bullet points, seniority level, and structure.

### Global vs. Per-Interview Scope
- **Global Defaults:** Configured once in Settings (`ProfileIntelligenceSettings.tsx` / `CustomInstructionsSettings.tsx`).
- **Per-Interview Customization:**
  - A `⚙️ Role & Persona` button in the interview chat header opens an override popover/modal.
  - **Toggle:** `[✓] Override Global Background & Persona for this Interview`.
  - **Inputs:**
    - `Candidate Background for this Role` (e.g., emphasize Go, Kubernetes, and distributed systems for Google).
    - `AI Persona & Style for this Role` (e.g., Staff Engineer tone, start with high-level architecture before trade-offs).
  - When unchecked, the interview seamlessly inherits the global settings.

### Data Model Extension (`InterviewWorkspaceStateManager.ts`)
```typescript
export interface InterviewWorkspace {
  id: string;
  title: string;
  rounds: InterviewRound[];
  activeRoundId?: string;
  documentIds: string[];
  // New override properties:
  hasCustomOverrides?: boolean;
  candidateBackgroundOverride?: string;
  aiPersonaOverride?: string;
  createdAt: number;
  updatedAt: number;
}
```

### LLM Prompt Assembly Integration
When assembling prompts in `WhatToAnswerLLM.ts` or `LLMHelper.ts`:
```typescript
const backgroundContext = (workspace?.hasCustomOverrides && workspace?.candidateBackgroundOverride?.trim())
  ? workspace.candidateBackgroundOverride.trim()
  : globalCustomNotes;

const personaContext = (workspace?.hasCustomOverrides && workspace?.aiPersonaOverride?.trim())
  ? workspace.aiPersonaOverride.trim()
  : globalPersona;
```

---

## 7. IPC & Preload Interface Updates

### New / Updated IPC Channels
1. `interview-workspace:update-persona-overrides`:
   - Payload: `{ workspaceId: string, hasCustomOverrides: boolean, candidateBackgroundOverride?: string, aiPersonaOverride?: string }`
2. `knowledge-bank:get-document-usage`:
   - Returns a mapping of `docId -> Array<{ workspaceId: string, workspaceTitle: string }>` so Knowledge Bank cards know which interviews reference each file.

---

## 8. Verification & Quality Gates

1. **Unit Tests:**
   - Expand `InterviewWorkspaceStateManager.test.mjs` to cover persona overrides, persistence across reloads, and workspace document detachment.
2. **React Doctor:**
   - Maintain 0 errors on `npm run doctor` across all components.
3. **Accessibility:**
   - Clean keyboard navigation with `Tab`, `Enter`, and `Esc` for modals and segmented switchers.
4. **Electron & TypeScript Compilation:**
   - `npx tsc --noEmit -p tsconfig.json` with 0 errors.
   - `npm run build:electron` builds cleanly without warnings.
