# website/

## Responsibility

The public marketing / landing site for AnswerCue (`answercue-website`). Standalone Next.js app
sibling to the root Electron app — it is NOT part of the app runtime. Jobs:

- Present the product landing page (marketing copy, feature/hero sections) to site visitors.
- Serve **live download links** for the desktop app: buttons call API routes that resolve to the
  latest GitHub Release assets at request time, so published releases are picked up automatically
  with no version hardcoding in the site.

## Design

- **Framework**: Next.js 14 (`^14.2.35`) with the **App Router** (React 18). `next.config.mjs`
  enables `reactStrictMode`.
- **Styling**: Tailwind CSS 3.4 via `postcss.config.mjs` (tailwindcss + autoprefixer plugins).
  `tailwind.config.ts` defines the brand design system — custom `brand` palette (blue → pink
  gradient), `ink` text color, Inter font stack, `brand-gradient` background image, `glow` shadow,
  and `floaty`/`drift`/`shimmer`/`blink` keyframe animations.
- **TypeScript**: strict mode, bundler module resolution, `@/*` path alias mapped to the package
  root (`tsconfig.json`).
- **API routes** (per README, under `app/`): `/api/download/<platform>` fetches the latest GitHub
  release at request time and 302-redirects to the matching asset. Responses cached 30 minutes.
  Platforms: `mac` (DMG), `mac-arm` (Apple Silicon zip), `mac-intel` (Intel zip), `windows` (exe).

## Flow

- **Build pipeline**: `npm run dev` → `next dev` (local dev, http://localhost:3000);
  `npm run build` → `next build`; `npm start` → `next start` (production server);
  `npm run lint` → `next lint`.
- **Static generation / rendering**: App Router with server components (`app/`); `components/` and
  `lib/` are scanned by Tailwind for classes. The `@/*` alias imports resolve from the package root.
- **Runtime request flow (downloads)**: user clicks a download button → client hits
  `/api/download/<platform>` → API fetches `releases/latest` from GitHub (optionally with
  `GITHUB_TOKEN`) → 302 redirect to the versioned asset URL. Fresh releases appear without any
  site redeploy.

## Integration

- **GitHub Releases (primary integration)**: download endpoints consume the public GitHub API for
  the `FarzamHejaziK/AnswerCue` repo. Optional `GITHUB_TOKEN` env var (see `.env.example`) raises
  the API rate limit; a fine-grained token with public-repo read access is recommended.
- **Deployment**: deployed on Vercel with Root Directory set to `website/`; Next.js framework preset
  auto-detected. The site lives in a subfolder of the monorepo and is deployed independently of the
  Electron app.
- **Canonical/OG URLs**: `SITE` constant in `app/layout.tsx` (per README) controls canonical/OG URL
  and must be updated if a custom domain is attached.
- **No coupling to the app codebase**: no shared modules with the root Electron app; integration is
  purely via the GitHub Releases API.
