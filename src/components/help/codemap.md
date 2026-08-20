# src/components/help/

## Responsibility

Single-component folder. Owns the in-app **Help Assistant**: a floating chat widget plus a rendered copy of the AnswerCue help guide, used for product support without leaving the app. It answers user questions about setup, audio, permissions, models, live interview actions, shortcuts, transcripts, documents, and troubleshooting.

- `HelpAssistant.tsx` — the entire UI: floating "Help" pill button, openable chat panel with Chat/Guide tabs, and the assistant chat logic.

## Design

- **Floating overlay**: fixed-position button (bottom-right, `z-[2200]`, `no-drag`) with a dismiss (X) affordance. Panel is a 440px-wide card that scrolls messages independently of the app.
- **Two views**: `chat` (message thread + composer) and `guide` (rendered markdown of the bundled help guide with a Copy button). Toggle via segmented buttons in the header.
- **State machine**: `HelpState = 'idle' | 'waiting' | 'streaming' | 'error'`. `waiting` = request fired, no tokens yet; `streaming` = tokens arriving via pre-registered IPC listeners; `error` = stream failure (placeholder assistant message removed, inline error banner shown).
- **Message model**: `HelpMessage { id, role: 'user' | 'assistant', content, createdAt, isStreaming? }`. User messages rendered as plain text; assistant messages rendered as markdown via `ReactMarkdown` + `remarkGfm` with custom styled components.
- **Streaming via buffer**: uses `useStreamBuffer` (`appendToken`/`getBufferedContent`/`reset`). Tokens arrive from IPC listeners and are appended to a shared buffer; each append re-renders the in-flight assistant message with `isStreaming: true` plus a pulsing cursor. On done, the buffered content is committed and streaming flags cleared.
- **Persistence**: messages and the dismiss flag live in `localStorage` (`answercue_help_assistant_messages_v1`, `answercue_help_assistant_dismissed_v1`), capped at 80 messages, with a defensive read/save wrapper for constrained/private environments. Reading validates roles and content, regenerating ids as needed.
- **RAG-ish context**: each question is wrapped in `<answercue_help_guide>` tags with the raw help-guide markdown, plus the last 16 messages in `<recent_help_chat>` tags, so the model answers from bundled docs + conversation continuity.
- **System prompt**: `HELP_ASSISTANT_SYSTEM_PROMPT` constrains the model — concise/step-by-step, not the live interview assistant, never writes to transcript or prep chat, asks for missing platform/provider/audio/meeting details, never invents hidden settings.
- **Restore hook**: listens for the `answercue-help-assistant-show` window event; clears the dismissed flag and optionally opens the panel on `detail.open`.

## Flow

1. **Mount**: `readStoredMessages()` seeds state; `messages` changes persist via effect → `saveStoredMessages()`.
2. **Open**: button toggles `isOpen`, resets view to `chat`. When open, queries `window.electronAPI.getCurrentLlmConfig()` for the model label and subscribes to `onModelChanged` to update it live.
3. **Submit** (`submitQuestion`):
   - Guard: non-empty draft and state is `idle`/`error`.
   - Appends user message + empty `isStreaming` assistant message; snapshot of pre-turn history is captured for context.
   - Resets stream buffer, clears stale listeners, sets state `waiting`.
   - Registers `onGeminiStreamToken` / `onGeminiStreamDone` / `onGeminiStreamError` listeners; each registers a cleanup into `streamCleanupsRef`.
   - Calls `window.electronAPI.streamGeminiChat(question, undefined, buildHelpContext(historyBeforeTurn), { systemPrompt, ignoreKnowledgeMode: true, recordInSession: false })`.
   - Token listener → `appendToken` → live-updates assistant message; Done → commit final content (fallback message if empty), state `idle`; Error/throw → drop the assistant message, show error banner, state `error`.
4. **Composer**: textarea submits on Enter (Shift+Enter = newline); send button disabled unless `canSubmit` (draft non-empty and not busy).
5. **Close/dismiss/clear**: all three cancel an in-flight stream via `cancelChatStream()` + listener cleanup + buffer reset. Dismiss also sets the dismiss flag in `localStorage` (hides the whole widget); clear wipes messages from state and storage.
6. **Guide view**: renders `helpGuideMarkdown` through `ReactMarkdown`; Copy writes raw markdown to `navigator.clipboard` with transient "Copied" feedback; CTA button switches back to chat and focuses the textarea.

## Integration

- **`src/content/answercue-help-guide.md`** (raw import, `?raw`): bundled markdown served as the guide view, the copy payload, and the primary knowledge source for chat answers.
- **`window.electronAPI`** (Electron preload bridge):
  - `streamGeminiChat(question, undefined, context, options)` — request side; options disable knowledge-mode injection and session recording (`recordInSession: false`) so help chat does not pollute interview sessions.
  - `onGeminiStreamToken` / `onGeminiStreamDone` / `onGeminiStreamError` — streaming response side.
  - `cancelChatStream()` — abort in-flight request.
  - `getCurrentLlmConfig()` / `onModelChanged` — model label display in the panel header.
- **`src/hooks/useStreamBuffer`** — token buffering primitives for the streaming assistant message.
- **`src/utils/messageId`** — `genMessageId()` for user/assistant message ids.
- **localStorage** — keys `answercue_help_assistant_messages_v1` and `answercue_help_assistant_dismissed_v1` for persistence.
- **External wake-up** — the `answercue-help-assistant-show` window event lets other app code reopen the assistant (and un-dismiss it).
