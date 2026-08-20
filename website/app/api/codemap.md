# website/app/api/

## Responsibility

Root of the website's HTTP API surface (Next.js App Router route handlers). This folder is the entry point for server-side endpoints served by the website. Direct inspection (excluding child folders) shows no route files live at this level — the actual route handlers are grouped under the `download/` child folder, which is the only child of this directory.

## Design

- Uses Next.js App Router conventions: each subfolder under `app/api/` maps to a URL path segment (`/api/<folder>`).
- Route grouping is by resource/feature. The single current group is `download/`, which owns the `/api/download` endpoint(s).
- No `route.ts` / `route.js` files exist directly in this folder; all handlers are nested one level down in `download/`.
- This folder acts as the namespace root — it does not define behavior itself, only organizes the route groups beneath it.

## Flow

- Incoming requests to `/api/*` are routed by Next.js to the matching handler under this tree.
- Because no handler exists at this exact directory level, requests to `/api` (no sub-path) have no direct handler here; real handling begins at the `download/` group.
- Request → Next.js router → `download/` handler → response. (Handler internals live in the excluded child folder and are not documented here.)

## Integration

- Consumed by the website's client code as the backend for `/api` calls.
- The `download/` group is the sole integration point reachable from this folder's direct scope.
- Note: this codemap covers only files directly in this folder. The `download/` child folder (and any deeper nesting) is out of scope for this inspection and should be documented in its own codemap.
