# electron/services/telemetry/

## Responsibility

Central telemetry/analytics service for the Electron app. Collects structured
events (app lifecycle, meetings, LLM/STT/RAG performance, dynamic actions,
post-call summaries) and persists them locally as JSONL. Enforces strict
privacy sanitization so telemetry never carries raw user content or secrets.
Exposes a shared singleton (`telemetryService`) used across the app.

## Design

- **`TelemetryService`** — class holding runtime state: `enabled`,
  `localEnabled`, `logFilePath`, and `sinks[]`. Constructed from a
  `TelemetryConfig`; a default singleton `telemetryService` is exported.
- **Event model** — `TelemetryEventName` union enumerates the known event
  names; `TelemetryEventInput` is the caller-facing shape; `TelemetryRecord`
  is the normalized, persisted shape (adds `timestamp`, sanitized `properties`).
- **Sinks** — `TelemetrySinkName = 'local-jsonl' | 'posthog' | 'axiom' |
  'sentry'`. Only `local-jsonl` is implemented; the other sinks are
  placeholders (intentionally no-op to avoid dependencies and keep default
  behavior local-only). Each sink has an `enabled` flag plus optional
  `endpoint`/`projectId`.
- **Sanitization** — `sanitizeTelemetryProperties` recursively walks the
  properties object:
  - `REMOVE_VALUE_KEY_RE` keys → value replaced with `[REMOVED]` (bulky raw
    text dropped entirely).
  - `SENSITIVE_KEY_RE` keys → value replaced with `[REDACTED]` (keys ending in
    api key / token / secret / password / credential / transcript / prompt /
    reference / evidence / screenshot / image / error body / query / user
    input / chunk / snippet, etc.).
  - `redactString` scrubs known API-key value patterns (Bearer tokens,
    `natively_sk_`, `sk-`, `gsk_`, `dg_`, JWT-like) from any string.
  - Handles circular references (`[Circular]`), drops functions/symbols,
    coerces `NaN` → `null`, `bigint` → string.
- **Failure isolation** — local writes are wrapped in try/catch; telemetry
  must never break app behavior.

## Flow

1. Caller invokes `telemetryService.track(input)` with an event name and
   optional `sessionId`, `modeId`, `provider`, `durationMs`, `status`,
   `properties`.
2. `track` returns immediately if `enabled` is false.
3. Input is normalized into a `TelemetryRecord` (ISO timestamp added,
   `properties` passed through `sanitizeTelemetryProperties`).
4. If `localEnabled`, `appendLocal` ensures the log directory exists
   (`mkdirSync` recursive) and appends one JSON line per record to
   `logFilePath` (default `<userDataPath>/logs/telemetry.jsonl`).
5. Iterates `sinks[]`; non-local sinks are currently no-op placeholders.

## Integration

- **Configuration / settings flow** — `configure(config)` is the runtime
  reconfiguration entry point (Phase 6). It lets the shared singleton switch
  from a `process.cwd()`-relative log path to the real Electron `userData`
  path once the app is ready, and carries settings changes (enable/disable
  telemetry, local logging, sink list). It never mutates the in-memory log
  buffer — old events stay where they were written.
- **Consumers** — any module importing `telemetryService` and calling
  `track(...)` with one of the `TelemetryEventName` values (app start,
  meeting start/stop, mode select/switch, dynamic actions, LLM/STT/RAG
  events, screen context, post-call summaries). Consumers are external to
  this folder; the event-name union is the contract they use.
- **Persistence** — local JSONL file under the Electron `userData` path
  (`logs/telemetry.jsonl`); the exact path is exposed via `getLogFilePath()`.
- **State queries** — `isEnabled()` and `getLogFilePath()` expose current
  state to callers.
