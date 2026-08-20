# website/app/api/download/[platform]/

## Responsibility

Public download endpoint for the website: redirects the user to a direct asset download (or the GitHub releases page fallback) for a given desktop platform. Single dynamic route `GET /api/download/[platform]` backed by `route.ts`. No app-side persistence; it is a pure redirector.

## Design

- Single `GET` route handler; `dynamic = "force-dynamic"` so responses are never statically cached at build time.
- Platform whitelist `VALID: Platform[] = ["mac", "mac-arm", "mac-intel", "windows"]`; the route param is cast to the `Platform` type from `@/lib/github`.
- All responses are `302` redirects (never a rendered body / never a download stream).
- Two lookup layers:
  1. Resolve a matching asset URL from the latest GitHub releases.
  2. Fall back to the generic `{REPO_URL}/releases/latest` page when no matching asset exists.
- Revalidation is disabled for the release fetch (`{ revalidate: false }`) so the redirect always reflects current GitHub state.

## Flow

1. Request hits `GET /api/download/:platform`.
2. Handler checks `platform` against `VALID`.
   - Invalid/missing platform -> `302` redirect to `${REPO_URL}/releases/latest`.
3. `getRecentReleases(10, { revalidate: false })` fetches the 10 most recent releases from GitHub, newest-first (unfetched-cache, forced fresh).
4. `resolveAssetUrl(releases, platform)` searches those releases for an asset matching the platform.
   - Found -> `302` redirect to that asset's direct download URL.
   - Not found (e.g. newest release lacks that platform's build) -> `302` redirect to `${REPO_URL}/releases/latest`.
5. Response returned to the client; browser follows the redirect.

## Integration

- External: GitHub Releases via `@/lib/github` helpers — `getRecentReleases(limit, opts)`, `resolveAssetUrl(releases, platform)`, the `Platform` type, and the `REPO_URL` constant. All platform-name mapping, asset-name matching, and repo identity live in that lib, not in this route.
- Consumers: website download buttons/links that target `.../download/<platform>` (mac, mac-arm, mac-intel, windows) to hand users the right installer.
- Notably decoupled from the desktop app's native update/install logic; this endpoint only surfaces public release artifacts.
