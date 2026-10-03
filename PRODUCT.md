# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Electron, React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide React, better-sqlite3

## Users

Software engineers, engineering leaders, product managers, and high-impact candidates preparing for and actively undergoing high-stakes live job interviews.

## Product Purpose

InterviewOS transforms the interview preparation and live execution process into a structured, executive-grade workstation. It replaces disjointed note docs and ephemeral chat windows with persistent company workspaces, multi-round interview timelines, a master candidate Knowledge Bank, and whisper-fast, context-grounded AI copilot capabilities during live rounds.

## Positioning

Unlike generic consumer chatbots or superficial browser plugins, InterviewOS is built specifically for the extreme cognitive load of high-stakes interviews. It runs natively on the desktop, grounds all suggestions strictly in the candidate's real portfolio and master documents, allows role-specific persona tuning per company, and delivers sub-second glanceable insights that candidates can absorb while speaking without breaking eye contact.

## Operating Context

- **Environment:** Desktop execution (macOS / Windows / Linux) often arranged side-by-side or split-screen alongside video conferencing apps (Zoom, Google Meet, Microsoft Teams).
- **Cognitive Load:** Extremely high. During live interviews, the candidate cannot read paragraphs or navigate complex menus. Visual telemetry must be legible in 1–2 second glances.
- **Lighting & Aesthetics:** Deep charcoal dark palette is critical to prevent screen glow from illuminating the candidate's face on webcam video feeds.
- **Data Sensitivity:** Master resumes, proprietary work examples, and system architectures remain local-first with atomic disk persistence.

## Capabilities and Constraints

- **Persistent Workspaces:** Multi-round interview chats organized by target role and company (e.g. "Google — Staff Backend").
- **Knowledge Bank Hub:** Centralized document vault for resumes, brag sheets, system design notes, and company profiles with cross-interview usage tracking.
- **Active Context Strip:** Lightweight inline document attachment in the interview view without bulky sidebar drawers.
- **Dual-Layer Context & Persona Overrides:** Global defaults configured in Settings with fine-grained per-interview overrides for both Candidate Background (*who you are*) and AI Persona (*how the AI answers*).
- **Latency & Reliability:** Local-first state management, zero runtime blocking, sub-second LLM streaming, atomic disk persistence (`.tmp` write then rename).

## Brand Commitments

- **Name:** InterviewOS
- **Aesthetic World:** Executive Charcoal & Warm Amber (Raycast / Linear-grade precision; dark `#121214` canvas, `#16161a` surfaces, `#1c1c21` cards, `#f59e0b` / `#fbbf24` warm amber focal points).
- **Anti-Slop Craft:** Zero decorative gradient text, zero cartoonish spring bounce easing, zero nested cards, zero meaningless eyebrows/kickers. All motion is physics-grounded with exponential ease-out curves.
- **Iconography & Typography:** Crisp Lucide vector glyphs, high-contrast readable typography, tabular numerals for telemetry and metrics.

## Evidence on Hand

- Production Electron application with local SQLite database, audio capture engine, and multi-provider LLM inference (Claude, OpenAI, Gemini).
- Tested domain state persistence in `electron/services/InterviewWorkspaceStateManager.ts`.
- Clean React Doctor bill of health (0 errors).

## Product Principles

1. **Glanceability Over Density:** Every live indicator, hint, or round status must be understandable in under 2 seconds.
2. **Never Break Candidate Eye Contact:** Visual hierarchies lead the eye naturally with calibrated contrast, avoiding bright distractions or jarring layout shifts.
3. **Candidate Truth Is Sacred:** AI responses must be strictly anchored in the candidate's verified experience from the Knowledge Bank; never fabricate achievements.
4. **Frictionless Transitions:** Switching rounds, attaching context documents, or overriding personas must be immediate, non-modal where possible, and auto-saved.
5. **Craft at the Floor:** Invisible details (custom scrollbars, text selection, focus rings, tabular figures, precise 1px borders) define the tool's executive feel.

## Accessibility & Inclusion

- Strict text contrast ratios (≥4.5:1 for body and placeholder, ≥3:1 for large display headers).
- Full keyboard navigation support (`Tab`, `Enter`, `Esc`) for all interactive elements, modals, and segmented switchers.
- No nested interactive controls (clean separation of container buttons and inner actions).
