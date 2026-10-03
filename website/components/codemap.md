# website/components/

## Responsibility

Reusable, client-side marketing UI primitives for the InterviewOS landing page. This folder holds the small set of interactive/visual building blocks that the single-page marketing site (`app/page.tsx`) composes into its hero, feature, and CTA sections. It deliberately excludes page-level layout (that lives inline in `app/page.tsx`) and styling utilities (those live in `app/globals.css`).

Four components live here:

- **`Reveal.tsx`** — scroll-triggered fade/slide-in wrapper (the site's primary entrance animation).
- **`Spotlight.tsx`** — cursor-driven ambient glow + per-card hover spotlight.
- **`DownloadButton.tsx`** — OS-aware download CTA with a platform picker dropdown.
- **`AppMock.tsx`** — pure-CSS/JSX mock of the live-interview UI (no image asset).

## Design

- **All components are `"use client"`** (except `AppMock`, which is pure presentational JSX and needs no client directive). They rely on browser APIs (`IntersectionObserver`, `PointerEvent`, `navigator.userAgent`) and local React state, so they must run on the client.
- **Styling is Tailwind utility classes** plus a few bespoke CSS classes defined in `app/globals.css` that these components depend on:
  - `Reveal` toggles the `.reveal` / `.reveal.in` classes (opacity + translateY transition, with `transitionDelay` set inline from its `delay` prop).
  - `Spotlight` renders a `.cursor-glow` element and mutates CSS custom properties (`--gx/--gy` on the glow, `--mx/--my` on each `.gcard`) that `globals.css` consumes to position the glow and the card's radial hover highlight.
  - `AppMock` uses `.glow-ring`, `.animate-blink`, and brand utility classes.
- **Component contracts are small and prop-driven:**
  - `Reveal({ children, delay = 0, className = "" })` — wraps arbitrary children; `delay` (ms) staggers the transition; `className` is forwarded to the wrapper div.
  - `Spotlight()` — no props; a self-contained effect component that renders a single decorative div.
  - `DownloadButton()` — no props; self-contained OS detection + dropdown state.
  - `AppMock()` — no props; static mock content.
- **No shared state or context** between components; each is independent. Composition happens at the consumer (`app/page.tsx`) level by nesting `Reveal` around the others.

## Flow

- **`Reveal`**: On mount, creates an `IntersectionObserver` (threshold `0.12`) on its wrapper. When the element scrolls into view it sets `shown = true` (adding `.in`) and disconnects the observer. The CSS transition then animates it in. `delay` is applied as an inline `transitionDelay`. Respects `prefers-reduced-motion` via CSS (`.reveal` is forced visible when reduced motion is on).
- **`Spotlight`**: On mount, bails out early on coarse-pointer (touch) devices. It registers a passive `pointermove` listener and, inside a `requestAnimationFrame` throttle, writes the pointer coordinates to `--gx/--gy` on the `.cursor-glow` element (which is translated via CSS) and to `--mx/--my` on every `.gcard` within a hover margin. Cleanup removes the listener and cancels any pending frame.
- **`DownloadButton`**: On mount, detects the OS from `navigator.userAgent`/`navigator.platform` (`mac-arm` | `mac-intel` | `windows` | `unknown`). The primary button links to `/api/download/{primary}` (defaulting `unknown` → `mac-arm`). A chevron button toggles a dropdown listing all three platforms; a document-level `mousedown` listener closes it when clicking outside the wrapper. Each option links to `/api/download/{key}`.
- **`AppMock`**: Static render — no runtime flow. Composes local `Bubble` (transcript message, `tone: "them" | "me"`) and `Dot` helpers to draw a fake live-interview window (title bar, transcript column, AI-suggestion column, attached-context list).

## Integration

- **Consumers**: All four components are imported by `app/page.tsx` (the only consumer in this folder's scope).
  - `Spotlight` is rendered once at the top of `<main>`.
  - `Reveal` wraps nearly every section and hero element, with staggered `delay` values (0–300ms) for the hero and per-card delays in the features/how-it-works grids.
  - `DownloadButton` appears in the hero (wrapped in `Reveal`).
  - `AppMock` appears in the hero inside a `Reveal` + `.animate-floaty` wrapper.
- **CSS coupling**: Components depend on classes in `app/globals.css` (`.reveal`, `.cursor-glow`, `.gcard`, `.glow-ring`, brand utilities). `Spotlight`'s behavior is tightly coupled to the `.gcard` class used by the feature/how-it-works cards in `app/page.tsx`.
- **Download backend**: `DownloadButton` links to the `app/api/download/[platform]` route, which resolves the real asset URL via `lib/github.ts` (`getRecentReleases` + `resolveAssetUrl`) and 302-redirects. The nav and final-CTA buttons in `app/page.tsx` link to the same route directly (hardcoded `mac-arm`/`windows`).
- **Data**: `AppMock` and `Spotlight` are purely presentational. `DownloadButton` is the only component that reaches outward (to the download API route). Version/`REPO_URL` data used by the page comes from `lib/github.ts`, not from these components.
