# src/lib/analytics/

## Responsibility

Single, self-contained GA4 (Google Analytics 4) tracking service for the Electron app. It:

- Injects the `gtag.js` script into the renderer DOM at runtime (works in Electron without a bundler plugin or API secrets — only the public Measurement ID `G-494RMJ2G6E` is needed).
- Exposes a singleton `analytics` service (`AnalyticsService.getInstance()`) with typed tracking methods for app lifecycle, feature usage, meeting lifecycle, model usage, session, and engagement events.
- Exports `detectProviderType(modelName)` — a pure helper that classifies a model name as `'local'` (Ollama-style names: `ollama:`, `llama`, `mistral`, `codellama`, `phi`, `deepseek`, `qwen`, `vicuna`, `orca`) or `'cloud'` (everything else, e.g. Gemini/GPT/Claude/Groq).
- Defines the `AnalyticsEventName` union, `ModelUsedPayload`, and `SessionDurationPayload` types used by callers.

## Design

- **Singleton**: `AnalyticsService` uses a private constructor + static `getInstance()`; the module exports a ready-made `analytics` instance. All tracking methods are no-ops when `initialized` is false.
- **Lazy init**: `initAnalytics()` is idempotent (guarded by `initialized`). It (1) seeds `window.dataLayer` and a `gtag` shim, (2) configures GA4 with privacy settings, (3) injects the `gtag.js` `<script>` tag, (4) marks itself initialized. Failures are caught and logged — analytics degrades to disabled rather than crashing the app.
- **Manual event sending**: `trackEvent()` is the single funnel for all events. It logs to console in dev (`import.meta.env.DEV`) and calls `window.gtag('event', ...)` with `app_version` merged into every payload. Guarded by try/catch.
- **Session/assistant duration bookkeeping**: the service tracks `sessionStartTime`, `assistantStartTime`, and `totalAssistantDuration` in memory. `trackAppClose()` computes a `session_duration` event with `duration_seconds`, `assistant_active_seconds`, and `idle_seconds` (rounded).
- **First-launch flag**: `trackAppOpen()` uses `localStorage` key `natively_has_launched` to emit `first_launch` exactly once per install.

## Flow

1. App boots → `App.tsx` calls `analytics.initAnalytics()` on mount, then `trackAppOpen()` (which may fire `first_launch`).
2. UI events call the typed trackers, e.g. `trackAssistantStart/Stop`, `trackModeSelected`, `trackModelUsed`, `trackCommandExecuted`, `trackCopyAnswer`, `trackMeetingStarted/Ended`, `trackCalendarConnected`, `trackPdfExported`, `trackConversationStarted`.
3. Each tracker guards on `initialized`, then calls `trackEvent(name, payload?)`.
4. `trackEvent` logs in dev and pushes `{ event, app_version, ...payload }` through `window.gtag` into the GA4 `dataLayer`.
5. On app close, `trackAppClose()` first emits `session_duration` (with accumulated assistant/idle seconds), then `app_closed`.

## Integration

- **Consumers** (import `analytics` and/or `detectProviderType` from `./lib/analytics/analytics.service`):
  - `src/App.tsx` — lifecycle: `initAnalytics`, `trackAppOpen`, `trackAppClose`, `trackAssistantStart/Stop`, `trackMeetingStarted/Ended`.
  - `src/components/AnswerCueInterface.tsx` — `trackConversationStarted`, `trackCopyAnswer`, `trackCommandExecuted` (what_to_say, follow_up_*, recap, suggest_questions, clarify, brainstorm), `trackModelUsed` with `detectProviderType(currentModel)`.
  - `src/components/Launcher.tsx` — `trackModeSelected` (launcher/undetectable) and many `trackCommandExecuted` calls (refresh_launcher, open_meeting_details, new_interview_ready_from_sidebar, device selection, rename_interview, interview_doc_uploaded, resume_meeting, start_prepared_interview, search variants), `trackPdfExported`.
  - `src/components/SettingsOverlay.tsx` — `trackModeSelected` (undetectable/overlay, disguise_*).
  - `src/components/ui/ConnectCalendarButton.tsx` — dynamic `import()` of the service, then `trackCalendarConnected`.
- **Privacy / local behavior**:
  - GA4 config sets `anonymize_ip: true`, `send_page_view: false` (no automatic pageview tracking), and `cookie_flags: 'SameSite=None;Secure'`.
  - No API secrets or user PII are stored in this module; only the public Measurement ID and `app_version` are sent.
  - All tracking is client-side in the renderer; if `gtag.js` fails to load or any send throws, events are dropped with a console warning — analytics never blocks app functionality.
  - `first_launch` is gated by a `localStorage` flag so it fires once per install.