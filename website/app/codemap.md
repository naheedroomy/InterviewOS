# website/app/

## Responsibility

Next.js App Router root for the AnswerCue marketing site. Owns the app shell and the single landing page:

- `layout.tsx` — root layout: global metadata/SEO, font loading, and the page-wide background ambience (mesh/vignette/grain overlays) that wraps every route.
- `page.tsx` — the one-page marketing site (`/`): hero, undetectable/stealth section, model marquee, features bento, pricing, how-it-works, final CTA, footer.
- `globals.css` — Tailwind entry + custom CSS (aurora, marquee, reveal, cursor-glow, gradient-text, glass/gcard, brand color tokens).
- `api/` — route handlers (see `api/codemap.md`); the download redirect endpoint is the only runtime integration the page depends on.

## Design

- **App Router, server-first.** `page.tsx` is an async Server Component; `layout.tsx` is a plain server component. Client interactivity is isolated in small `"use client"` components (`DownloadButton`, `Reveal`, `Spotlight`, `AppMock` is server-rendered pure JSX).
- **Static with ISR.** `page.tsx` exports `revalidate = 1800` (30 min). The only dynamic data is the latest GitHub release version, fetched at build/revalidate time via `getLatestRelease()` from `@/lib/github`; on failure it falls back to a hardcoded `v2.7.4`.
- **Single source of truth for copy.** All marketing claims (stealth points, features, pricing, steps) are inline data arrays (`STEALTH_POINTS`, `PROVIDERS`, step tuples) mapped to JSX — no CMS.
- **Visual system via CSS classes.** Brand colors (`brand-blue/pink/purple/indigo`, `brand-gradient`, `ink`), effects (`aurora`, `grid-overlay`, `glass`, `gcard`, `glow-ring`, `gradient-text`, `marquee`, `reveal`, `animate-floaty`) are defined in `globals.css` and consumed by Tailwind utility classes throughout the page.
- **Scroll-reveal + cursor effects.** `Reveal` (IntersectionObserver, threshold 0.12, staggered `delay` prop) fades sections in; `Spotlight` (pointermove + rAF) drives the ambient cursor glow and per-card `--mx/--my` spotlight on `.gcard` elements. Both are client components but render no visible markup of their own.
- **Download UX.** `DownloadButton` (client) UA-detects the OS, links to `/api/download/{mac-arm|mac-intel|windows}`, and offers a dropdown of all platforms. Static CTA anchors in the hero/final CTA also point at `/api/download/mac-arm` and `/api/download/windows`.

## Flow

1. Request hits `/` → `layout.tsx` renders `<html>` shell, injects Google Fonts (Inter) + theme-color, and paints the fixed background layers (`mesh`, `mesh-rotate`, `vignette`, `grain`) around `{children}`.
2. `page.tsx` (async) awaits `getLatestRelease()` → `version` (tag or fallback `v2.7.4`), then renders the page sections top to bottom. `Spotlight` mounts and attaches pointer listeners; `Reveal` wrappers observe their sections and toggle the `in` class on scroll.
3. User clicks a download CTA → browser hits `/api/download/{platform}` → route handler (force-dynamic) fetches recent GitHub releases, resolves the best asset URL for the platform, and 302-redirects to the asset (or `releases/latest` as fallback).
4. ISR revalidates the page every 30 min, refreshing the version badge and release links.

## Integration

- **`@/lib/github`** — `getLatestRelease()` (page version badge) and `getRecentReleases()` + `resolveAssetUrl()` (download route) talk to the GitHub REST API for `FarzamHejaziK/AnswerCue`; optional `GITHUB_TOKEN` env var raises the rate limit. Failures degrade gracefully (fallback version / redirect to releases page).
- **`@/components/*`** — `DownloadButton` (client, OS detection + dropdown), `AppMock` (pure-JSX product mockup), `Reveal` (scroll animation), `Spotlight` (cursor effects). All styled by `globals.css` tokens.
- **`app/api/download/[platform]/route.ts`** — the page's only backend dependency; every download CTA resolves through it.
- **Static assets** — `/icon.png` (favicon/logo, referenced in metadata + nav/footer), `/banner.png` (OG/Twitter image), served from `website/public`.
- **External** — Google Fonts (Inter) via `<link>` preconnect; GitHub repo/releases pages via `REPO_URL` links.