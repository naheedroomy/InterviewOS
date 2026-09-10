# website/lib/

## Responsibility

Central GitHub/Release helper module for the website. Owns all knowledge of the GitHub repo identity, the GitHub Releases API, and the mapping from a desktop platform to a downloadable release asset. It is the single source of truth for "what is the latest release" and "which asset URL serves platform X" — consumers never talk to GitHub directly.

## Design

- Single file `github.ts` exporting:
  - Constants: `REPO` (`"naheedroomy/InterviewOS"`) and `REPO_URL` (the GitHub repo URL).
  - Types: `ReleaseAsset` (`name`, `browser_download_url`, `size`), `LatestRelease` (`tag`, `htmlUrl`, `publishedAt`, `assets`), and `Platform` (`"mac" | "mac-arm" | "mac-intel" | "windows"`).
  - Fetch helpers: `getLatestRelease(options)` and `getRecentReleases(count, options)`.
  - Pure matching helpers: `pickAsset(assets, platform)` and `resolveAssetUrl(releases, platform)`.
- **Graceful degradation**: every fetch is wrapped in try/catch and returns a `FALLBACK`/empty result on error or non-OK response, so the site never crashes when GitHub is unreachable.
- **Optional auth**: sends `Authorization: Bearer <GITHUB_TOKEN>` only when `process.env.GITHUB_TOKEN` is set (raises the unauthenticated rate limit).
- **Cache control**: both fetch helpers accept `{ revalidate?: number | false }`. A number uses Next.js ISR revalidation (default `60`s); `false` switches to `cache: "no-store"` for forced-fresh reads.
- **Asset matching** (`pickAsset`): regex-based, version-agnostic. DMG is preferred over ZIP (nicer install; ZIP exists mainly for the updater). `mac-arm` targets `arm64` assets; `mac-intel` and generic `mac` exclude `arm64` (Intel DMG runs on every Mac — natively on Intel, Rosetta on Apple Silicon); `windows` matches `.exe`.
- **Multi-release fallback** (`resolveAssetUrl`): scans releases newest-first so a platform whose build is missing from the very latest release (e.g. a partial CI publish) still resolves to the most recent release that has it.

## Flow

1. `getLatestRelease()` → `GET /repos/{REPO}/releases/latest` → normalized `LatestRelease` (or `FALLBACK`).
2. `getRecentReleases(count)` → `GET /repos/{REPO}/releases?per_page={count}` → filters out drafts/prereleases, maps to `LatestRelease[]` newest-first (or `[]`).
3. `pickAsset(assets, platform)` → best matching `ReleaseAsset` for a platform (or `null`).
4. `resolveAssetUrl(releases, platform)` → first non-null `pickAsset` across releases → direct `browser_download_url` (or `null`).

## Integration

- **`app/page.tsx`** (homepage): calls `getLatestRelease()` (ISR, `revalidate = 1800`) to render the current version badge (`release.tag || "v2.7.4"`), and uses `REPO_URL` for GitHub/Releases links.
- **`app/api/download/[platform]/route.ts`**: the download redirector. Calls `getRecentReleases(10, { revalidate: false })` (forced fresh) then `resolveAssetUrl(releases, platform)` to 302-redirect to the matching asset, falling back to `{REPO_URL}/releases/latest`. Uses the `Platform` type and `REPO_URL` constant.
- **`components/DownloadButton.tsx`** (client): detects the OS and links to `/api/download/{mac-arm|mac-intel|windows}` — it does not import `lib/github` directly but is the UI entry point that drives the download route.
- **`app/page.tsx`** static links: `/api/download/mac-arm`, `/api/download/windows` in hero/footer sections.
- All platform-name mapping, asset-name matching, and repo identity live here, keeping the download route and page thin.
