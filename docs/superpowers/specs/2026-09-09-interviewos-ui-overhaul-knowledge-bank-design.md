# Design Specification: InterviewOS — Modern UI Overhaul, Knowledge Bank & Persona Overrides

_Date: 2026-09-09_  
_Status: Approved (Tuned to Impeccable Standards)_  
_Target Release: InterviewOS 2.10.0_  
_Surface Mode: Operate (Desktop AI Copilot)_

---

## 1. Direction Contract (Impeccable Standard)

- **THESIS:** InterviewOS is an executive-grade cockpit for career-defining interviews. It rejects consumer chatbot tropes (decorative text gradients, bouncy spring animations, nested cards, and bulky drawer popups) in favor of high-density glanceability, split-second contextual recall, and zero-distraction dark mode ergonomics.
- **OWN-WORLD:** Executive Charcoal & Warm Amber. Deep `#121214` canvas ground, `#16161a` panel surfaces, `#1c1c21` elevated cards, hairline 1px `rgba(255, 255, 255, 0.07)` dividers, and `#f59e0b` / `#fbbf24` warm amber focal points. Semantic status is strictly reserved: `#10b981` for completed rounds, `#ef4444` for active audio capture, and warm amber for active rounds.
- **STORY:** A candidate navigates multi-round interview pipelines with zero cognitive friction. They curate master resumes and system design portfolios once in a centralized Knowledge Bank, immediately attach them via an inline Active Context strip in the interview chat, and tailor candidate background facts and AI persona styles per company—delivering sub-second, perfectly grounded live answers during high-stakes calls without breaking eye contact.
- **FIRST VIEWPORT:**
  - **Top Navigation Rail:** Unified branded header (`[⚡ InterviewOS]`, segmented switcher `[ 💬 Interviews ]` vs `[ 📚 Knowledge Bank ]`, and quick audio/readiness status indicator with Settings `⚙️`).
  - **Interviews Screen:** Left sidebar of persistent company workspaces with inline double-click renaming; main workspace with Round Switcher pill bar (`[ ✓ Round 1 ] [ 🟢 Round 2 ] [ + Next Round ]`), inline Active Context strip (`📎 [📄 Resume.pdf ✕] [+ Attach]`), role & persona status indicator, prep timeline, and live execution cockpit.
  - **Knowledge Bank Screen:** Master document vault with search, upload dropzone, document cards with file telemetry (formatted size, kind, parsed word count), and real-time interview usage badges (`Used in: Google (Round 1 & 2), Stripe`).
- **FORM & SIGNATURE INTERACTION:** 
  - Instant round switching with state isolation.
  - Seamless drag-and-drop file attachment in chat that automatically indexes to the Knowledge Bank and links to the active interview.
  - Non-modal header popover for per-interview candidate background and persona overrides with real-time inheritance preview.
- **FINISH:** `unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance`.

---

## 2. Impeccable Craft Floor & Refusal Rules

To eliminate the AI-generated aesthetic signatures detected in the incumbent codebase, the overhaul strictly adheres to the Impeccable craft floor:

### Absolute Bans (Anti-Slop)
1. **No Gradient Text:** All decorative text gradients (`background-clip: text`) in headers and badges are permanently eradicated. Text emphasis is achieved solely through font weight (`font-semibold` / `font-bold`), scale, and precise foreground contrast (`#fafafa` vs `#f59e0b`).
2. **No Bouncy or Elastic Easing:** Replace all spring curves (`cubic-bezier(0.34, 1.56, 0.64, 1)`) with smooth, physics-grounded exponential deceleration curves (`cubic-bezier(0.16, 1, 0.3, 1)` / `ease-out-quint`) with 120ms–180ms durations.
3. **No Decorative Grid-Line Backgrounds:** Decorative hairline linear-gradient background grids are stripped. Surfaces rely on clean semantic planes and structural dividers.
4. **No Eyebrows or Kickers:** Decorative uppercase micro-labels above headings are eliminated; headers state their purpose directly.
5. **No Nested Cards:** Strict prohibition of cards inside cards. Sections use flat semantic grouping separated by hairline borders (`1px solid rgba(255, 255, 255, 0.07)`).
6. **No Zero-Blur Halos:** Decorative glowing neon borders and zero-offset halos are refused. Depth is rendered with calibrated soft shadows (`0 4px 20px -2px rgba(0, 0, 0, 0.5)`).
7. **No Emoji as System Icons:** All icons are drawn Lucide SVG vectors with a consistent 1.5px stroke weight.

### Positive Craft Standards
- **Contrast Ratios:** Primary body and placeholder text strictly ≥4.5:1. Secondary text is tinted from the warm foreground (`#d4d4d8`, `#a1a1aa`), never a washed-out muddy gray.
- **Typography & Measure:** Body copy measure is capped at 65–75ch for optimal reading during high-stress prep and live answers. Headings use `-0.02em` tracking and `text-wrap: balance`. Tabular figures (`font-variant-numeric: tabular-nums` / `tnum`) are enforced on all timers, file sizes, and counters.
- **Browser Surfaces Theming:**
  - **Text Selection:** `selection:bg-amber-500/25 selection:text-amber-100`
  - **Caret Color:** `caret-amber-500`
  - **Scrollbars:** Minimal 6px scrollbars (transparent track, `#27272a` thumb, `#3f3f46` hover thumb)
  - **Focus Rings:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121214]`

---

## 3. Design System Tokens: Executive Charcoal & Warm Amber

### Color Palette
```css
:root {
  /* Canvas & Surfaces */
  --bg-canvas: #121214;
  --bg-surface: #16161a;
  --bg-card: #1c1c21;
  --bg-overlay: #202026;
  --bg-subtle: rgba(255, 255, 255, 0.03);

  /* Dividers & Borders */
  --border-hairline: rgba(255, 255, 255, 0.07);
  --border-elevated: rgba(255, 255, 255, 0.12);
  --border-active: rgba(245, 158, 11, 0.4);

  /* Primary Accent: Warm Amber */
  --amber-primary: #f59e0b;
  --amber-hover: #fbbf24;
  --amber-tint: rgba(245, 158, 11, 0.12);
  --amber-tint-hover: rgba(245, 158, 11, 0.18);
  --amber-border: rgba(245, 158, 11, 0.35);

  /* Text & Foreground */
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --text-on-amber: #18181b;

  /* Semantic Telemetry */
  --status-success: #10b981;
  --status-success-tint: rgba(16, 185, 129, 0.12);
  --status-live: #ef4444;
  --status-live-tint: rgba(239, 68, 68, 0.15);
  --status-warning: #f59e0b;
}
```

### Motion Physics
- **Entrance & Exits:** `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quint).
- **Fast micro-interactions (hover, pill selection):** 120ms.
- **Screen & modal transitions:** 180ms.
- Zero bounce, overshoot, or spring oscillations.

---

## 4. Primary Navigation Architecture

`Launcher.tsx` implements a unified top navigation rail:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [⚡ InterviewOS]         [ 💬 Interviews ]   [ 📚 Knowledge Bank ]        [⚙️] │
├──────────────────────────┬───────────────────────────────────────────────┤
│ Left Sidebar             │ Active Screen                                 │
│                          │                                               │
│ • Google — Staff Backend │ (Interviews Workspace: Prep & Live Cockpit)   │
│ • Stripe — Infra Lead    │                       OR                      │
│ • Meta — E5 Product      │ (Knowledge Bank Hub: Full-page Vault)         │
└──────────────────────────┴───────────────────────────────────────────────┘
```

### Navigation Behavior
- **Top Rail Segmented Switcher:**
  - `[ 💬 Interviews ]`: Renders the left company sidebar and the active interview workspace (round switcher, active context, timeline, live assistant).
  - `[ 📚 Knowledge Bank ]`: Transitions the main area to the full-page master document vault with cross-interview indexing.
- **Brand Title:** Prominently branded `InterviewOS` with a warm amber⚡ lightning glyph.
- **Utility Actions:** Audio permissions badge, mic readiness indicator, and Settings trigger (`⚙️`).

---

## 5. Dedicated Knowledge Bank Subsystem

### Purpose
Solves the friction of managing interview assets. Candidates store master resumes, brag sheets, system design architectures, and company research notes in a persistent, accessible library without re-uploading documents across separate interviews.

### Component Architecture: `src/components/KnowledgeBankView.tsx`
- **Header & Search:**
  - Display document count, total storage consumption, and instant live filtering search bar.
  - Primary Action: `＋ Upload Document` (triggering file selector or accepting drag-and-drop).
- **Drag-and-Drop Dropzone:**
  - Clean dashed border with subtle amber hover feedback.
  - Supported formats: `.pdf`, `.docx`, `.txt`, `.md`.
  - Automatic extraction of metadata: byte size, word count, document classification (Resume, Job Description, Technical Notes, General).
- **Document Cards Grid:**
  - File type icon with clean stroke styling.
  - Document title with inline rename support.
  - Document telemetry: formatted file size (`1.4 MB`), word count (`2,410 words`), last updated timestamp (`tnum`).
  - **Cross-Interview Usage Badges:** Displays tags showing where the document is attached (e.g. `Used in: Google (Round 1 & 2), Stripe`).
  - **Context Menu Actions (`•••`):**
    - Quick preview of parsed text.
    - Attach to active interview.
    - Delete document (with safe dependency check warning if linked to active workspaces).
- **Empty State:**
  - Designed empty state with clear guidance: *"Your knowledge bank is empty. Add your master resume, system design notes, or job descriptions to ground your AI answers in verified truth."*

---

## 6. Interview Chat & "Active Context" Strip

### Removal of Bulky Right Drawer
The awkward right drawer in `Launcher.tsx` is completely eliminated, reclaiming horizontal screen space for the prep timeline and live transcript.

### Active Context Strip
Mounted directly beneath the Round Switcher pill bar in the interview view:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [✓ Round 1: Screen]     [🟢 Round 2: Architecture]          [ + Next Round ] │
├──────────────────────────────────────────────────────────────────────────────┤
│ 📎 Active Context: [📄 Staff_Resume.pdf ✕] [📋 Job_Spec.pdf ✕]  [+ Attach]  │
└──────────────────────────────────────────────────────────────────────────────┘
```
- **Attached Document Pills:** Displays documents linked to `selectedWorkspace.documentIds`.
- **1-Click Detach (`✕`):** Detaches the file from the current interview workspace without deleting it from the Knowledge Bank.
- **`+ Attach from Knowledge Bank`:** Opens a fast picker listing all documents in the Knowledge Bank with checkboxes to attach/detach in one click.
- **Direct Drag-and-Drop:** Dropping any document into the interview workspace automatically saves it to the Knowledge Bank *and* attaches it to the current interview workspace.

---

## 7. Per-Interview Custom Instructions & AI Persona Overrides

### Conceptual Model
1. **Candidate Background (Custom Instructions):** *Who you are* — verified career facts, years of experience, key system architectures, and tech stack details.
2. **AI Persona (Response Style):** *How the AI answers* — seniority voice, conciseness level, bulleted vs prose structure, and trade-off orientation.

### Global Defaults vs. Per-Interview Overrides
- **Global Settings:** Configured globally in Settings (`ProfileIntelligenceSettings.tsx`).
- **Per-Interview Override Modal/Popover:**
  - Located in the interview header next to workspace title: `[ ⚡ Role & Persona ]`.
  - Toggle: `[✓] Override Global Settings for this Interview`.
  - When unchecked: Displays read-only preview of global settings with a badge: `Inheriting from Global Settings`.
  - When checked: Provides editable text areas for:
    1. `Role-Specific Candidate Background` (e.g., emphasize Go, Kubernetes, and high-throughput streaming for Stripe).
    2. `Role-Specific AI Persona & Style` (e.g., Staff Engineer tone: lead with architectural trade-offs, state bottlenecks first, concise bullets).

### Data Model Extension (`InterviewWorkspaceStateManager.ts`)
```typescript
export interface InterviewWorkspace {
  id: string;
  title: string;
  rounds: InterviewRound[];
  activeRoundId?: string;
  documentIds: string[];
  // Persona & Background Overrides:
  hasCustomOverrides?: boolean;
  candidateBackgroundOverride?: string;
  aiPersonaOverride?: string;
  createdAt: number;
  updatedAt: number;
}
```

### LLM Prompt Assembly Integration
In `WhatToAnswerLLM.ts` and `LLMHelper.ts`:
```typescript
const candidateContext = (workspace?.hasCustomOverrides && workspace?.candidateBackgroundOverride?.trim())
  ? workspace.candidateBackgroundOverride.trim()
  : globalCandidateNotes;

const personaContext = (workspace?.hasCustomOverrides && workspace?.aiPersonaOverride?.trim())
  ? workspace.aiPersonaOverride.trim()
  : globalPersona;
```

---

## 8. IPC & Preload Interface Additions

1. **`interview-workspace:update-persona-overrides`:**
   - Payload: `{ workspaceId: string, hasCustomOverrides: boolean, candidateBackgroundOverride?: string, aiPersonaOverride?: string }`
2. **`knowledge-bank:get-document-usage`:**
   - Returns: `Record<string, Array<{ workspaceId: string, workspaceTitle: string }>>` mapping document IDs to all referencing interview workspaces.
3. **`interview-workspace:attach-document` / `interview-workspace:detach-document`:**
   - Streamlined granular document attachment IPC channels.

---

## 9. Verification & Quality Gates

1. **React Doctor:** Must pass with **0 errors** (`npm run doctor`).
2. **TypeScript:** Strict type checking (`npx tsc --noEmit -p tsconfig.json`) with 0 errors.
3. **Electron Build:** Clean compilation of electron main and preload (`npm run build:electron`).
4. **Unit Tests:** Expand `InterviewWorkspaceStateManager.test.mjs` to test persona override persistence, document detachment, and atomic writes.
5. **Impeccable Design Audit:** Run Impeccable detector (`impeccable detect --json src`) to confirm zero gradient text or bounce easing anti-patterns remain in production code.
