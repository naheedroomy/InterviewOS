# website/app/api/download/

## Responsibility

Server-side download redirect route for the website. Given a platform slug in the URL
(`/api/download/:platform`), it resolves the correct installer asset from the project's
GitHub releases and issues a `302` redirect to the direct download URL (or to the
releases page as a fallback). It keeps the actual binary hosting on GitHub while giving
the site a stable, platform-aware download link.

## Design

- **Dynamic route** (`[platform]/route.ts`) with `export const dynamic = "force-dynamic"` so
  every request is evaluated fresh and newly published assets are reachable immediately.
- **Whitelist validation**: only `mac`, `mac-arm`, `mac-intel`, and `windows` are accepted.
  Any other slug redirects to the GitHub releases page (`302`).
- **No caching**: the route calls `getRecentReleases(10, { revalidate: false })`, which uses
  `cache: "no-store"` on the GitHub API fetch, so the redirect always reflects the latest
  published releases.
- **Resilience**: all GitHub API calls in `lib/github.ts` are wrapped in try/catch and fall
  back to empty results / the releases page URL on failure, so the route never 500s.
- **Asset matching** (`pickAsset` in `lib/github.ts`): matches assets by name regex, ignoring
  version numbers; prefers DMG over ZIP, and distinguishes Apple Silicon (`arm64`) from Intel
  builds. `mac` (generic) falls back to the Intel DMG, which runs on every Mac.

## Flow

1. `GET /api/download/:platform` receives the platform slug from the route params.
2. If the slug is not in the `VALID` whitelist, redirect to `${REPO_URL}/releases/latest` (302).
3. Otherwise fetch the 10 most recent published (non-draft, non-prerelease) releases via
   `getRecentReleases(10, { revalidate: false })`.
4. `resolveAssetUrl(releases, platform)` scans releases newest-first and returns the first
   matching asset's `browser_download_url` for that platform.
5. If a match is found, redirect to that direct asset URL (302); otherwise fall back to the
   releases page URL (302).

## Integration

- **`lib/github.ts`**: provides `getRecentReleases`, `resolveAssetUrl`, `pickAsset`, the
  `Platform` type, and `REPO_URL`. This is the only external dependency of the route.
- **GitHub Releases API**: the route's data source; fetches release metadata (tags, assets)
  for the `naheedroomy/InterviewOS` repo, optionally authenticated via `GITHUB_TOKEN`.
- **Frontend**: download buttons/links elsewhere in the site point at this route to obtain a
  platform-appropriate installer URL.
- **Sibling `[platform]/codemap.md`**: documents the route implementation itself; this file
  covers the folder's overall responsibility and flow.
