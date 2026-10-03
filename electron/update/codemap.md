# electron/update/

## Responsibility

Support the app's self-update flow with release notes. `ReleaseNotesManager` fetches GitHub release notes for the target version being updated to, parses them into structured sections, and caches the result so the UI can display "What's New" / changelog content without re-hitting the network on every view.

## Design

Single-purpose module: one class, `ReleaseNotesManager`, in `ReleaseNotesManager.ts`.

- **Singleton**: `getInstance()` returns one shared instance. No constructor args; `cachedNotes` is per-instance state.
- **Fixed repo identity**: hardcoded `repoOwner = "FarzamHejaziK"` and `repoName = "AnswerCue"` (the fork's public GitHub repo). Not configurable at runtime.
- **Transport**: uses Electron's `net.request` (Chromium network stack in the main process) instead of `fetch`/`https` — works identically across platforms and respects app network/proxy settings.
- **Strict markdown parsing**: release notes body is split on H2 headers (`## `). Only allowlisted section titles are kept: `Summary`, `What's New`, `Improvements`, `Fixes`, `Technical`. Bullet sections capture only lines starting with `- ` or `* `; `Summary` flattens its text to a single line.
- **Typed result**: `ParsedReleaseNotes` — `version`, `summary`, `sections[]` (title + items), `fullBody` (raw fallback), `url`.
- **Failure-tolerant**: every failure path (HTTP error, request error, stream error, parse/network exception) resolves to `null` rather than throwing. Callers must handle null.

## Lifecycle

The module participates in the update lifecycle's "show what changed" stage:

1. App detects/installs an update for a target `version` (from the auto-updater).
2. UI asks `fetchReleaseNotes(version)` to get changelog content.
3. Cache check: if `cachedNotes.version === version` and not `forceRefresh`, the cached notes are returned immediately — no network.
4. Otherwise a GitHub API request is made (see Flow), the body is parsed, the result is cached, and returned.
5. `getCachedNotes()` exposes the last parsed notes without triggering a fetch (e.g. for consumers that fetch early and render later).
6. Cache is in-memory only — lost on app restart; the next update check re-fetches.

No update download/install logic lives in this folder; this is the release-notes presentation side of the update flow.

## Flow

```
fetchReleaseNotes(version, forceRefresh?)
   |
   +-- cachedNotes.version === version && !forceRefresh --> return cache
   |
   +-- build GitHub API URL:
   |      version === 'latest'          -> GET /repos/{owner}/{repo}/releases/latest
   |      else (strict version, e.g. 1.2.3) -> GET /repos/{owner}/{repo}/releases/tags/v{version}
   |
   +-- net.request(GET) -> response
   |      status !== 200 -> warn + null
   |      collect chunks -> resolve(body string)
   |      request/stream error -> error + null
   |
   +-- JSON.parse(body) -> data
   |      body = data.body, url = data.html_url, version = data.tag_name || requested
   |
   +-- parseReleaseNotes(body, tagName, url)
   |      split on /^## /m
   |      allowlisted H2 titles only
   |      Summary -> flattened summary text
   |      bullet sections -> items from '- ' / '* ' lines
   |      -> ParsedReleaseNotes (fullBody kept as fallback)
   |
   +-- cache parsed notes -> return
```

## Platform Behavior

- **Cross-platform**: relies only on Electron `net`, so behavior is uniform on macOS, Windows, and Linux in the main process.
- **Network-dependent**: notes come from the public GitHub API (`api.github.com`); requires connectivity. Offline, DNS/proxy failure, or rate-limiting → `null` (UI should fall back to `fullBody`/generic messaging or hide the pane).
- **No auth**: unauthenticated GitHub API (rate limit ~60 req/hr per IP). Only one request per version-cache-miss, so normal update flow stays well under the limit.
- **Version matching**: strict versions are looked up as release tags with a `v` prefix added if missing; `latest` maps to the `/releases/latest` endpoint. Non-`latest` strict versions must have a matching GitHub tag or the fetch returns null.
- **Graceful degradation**: `null` on any failure; never throws into the update flow.

## Integration

- **Consumers**: invoked by the update-related UI flow elsewhere in the app (outside this folder) — typically after an update check/download to render the changelog pane, and via `getCachedNotes()` for pre-fetched display.
- **Electron main process**: imports `net` from `electron`; must be used from the main process context (not the renderer).
- **GitHub releases**: source of truth is the public `FarzamHejaziK/AnswerCue` repo's releases — release notes bodies must follow the H2-section convention (`## Summary`, `## What's New`, `## Improvements`, `## Fixes`, `## Technical`) for structured parsing to work.
- **Data shape contract**: consumers depend on `ParsedReleaseNotes` (`version`, `summary`, `sections`, `fullBody`, `url`); `fullBody` is the unparsed fallback when section extraction produces nothing.
