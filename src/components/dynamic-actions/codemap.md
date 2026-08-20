# src/components/dynamic-actions/

## Responsibility

Cluely-style "suggested actions" UI for live interviews. Renders a compact row of
action cards pushed from the engine (via the Electron main process), lets the user
accept one to kick off an answer stream, dismiss one, or accept the top card with
the Tab key. The folder is presentation + orchestration only: cards carry no
answer-generation logic, they only route user intent to parent callbacks.

## Design

Two components, intentionally thin:

- **`DynamicActionBar.tsx`** — container. Subscribes to
  `window.electronAPI.onIntelligenceDynamicAction`, holds the live action list in
  local state, and owns all list policy:
  - **Dedupe** by `action.id` (backend already dedupes; renderer guards against
    late-arriving duplicates after window restore).
  - **Sort** by `priority` desc, then `createdAt` desc (newer wins ties).
  - **Expire** cards older than `staleAfterMs` (default 60s, renderer-side cap;
    server already expires).
  - **Cap** display at `maxVisible` (default 3); keeps a `maxVisible * 2` buffer
    in state so a dismissed primary can be replaced without a re-push.
  - **Keyboard**: Tab (no modifiers, not focused in an editable element) accepts
    the primary card. Uses an `actionsRef` mirror of state so the keydown listener
    stays stable.
  - **Periodic prune**: 5s interval filters stale cards, only mounted while cards
    exist.
  - Renders `null` when nothing is visible; wraps cards in
    `AnimatePresence` for enter/exit animation.
- **`DynamicActionCard.tsx`** — single card. Presentation-only, dumb.
  - Glass style: `backdrop-blur`, translucent fill; primary card (index 0) gets an
    accent border + accent Zap icon + a `Tab` kbd hint.
  - Shows label, confidence percentage (`action.confidence` × 100, rounded), and a
    truncated first evidence snippet (`action.evidenceRefs[0].text`, 90 chars).
  - Click = accept; `busy` state guards against double-fire; separate dismiss
    button (stopPropagation) hides on hover.
  - Accept/dismiss are delegated to parent callbacks — the card never calls the
    answer stream itself.

## Flow

1. Main process pushes an `intelligence-dynamic-action` event
   (`{ action: DynamicActionPayload }`); the bar's mount effect subscribes and
   unsubscribes on unmount.
2. `handleIncoming` dedupes by id, prunes stale, sorts, slices to the buffer, and
   sets state.
3. `visible` memo exposes the top `maxVisible` cards, each rendered as a
   `DynamicActionCard` with `isPrimary = (index === 0)`.
4. Accept path: card click → `onAccept(action)` → bar removes the card
   optimistically, fires `window.electronAPI.acceptDynamicAction(action.id)`
   (errors swallowed), then calls the parent's `onAcceptAction(action)` — the
   parent is responsible for starting the live answer stream from
   `action.promptInstruction`.
5. Dismiss path: card X → `onDismiss(id)` → bar drops the card locally and fires
   `window.electronAPI.dismissDynamicAction(id)` (errors swallowed).
6. Tab path: window keydown → accept the first visible card (same as step 4),
   skipped if focus is in an input/textarea/contenteditable.

## Integration

- **Electron preload bridge** (`window.electronAPI`): consumes
  `onIntelligenceDynamicAction` (push), `acceptDynamicAction` (accept ack),
  `dismissDynamicAction` (dismiss ack). All calls optional-chained — the bar is a
  no-op in browsers without the bridge.
- **Types**: `DynamicActionPayload` from `@/types/electron` — fields used:
  `id`, `label`, `description`, `priority`, `confidence`, `createdAt`,
  `evidenceRefs` (`[0].text` snippet), `promptInstruction` (passed through to the
  parent, not consumed here).
- **Parent**: `onAcceptAction(action)` prop must kick off the answer stream; the
  bar makes no answer-generating calls itself. Parent placement determines where
  the bar appears in the chat/composer flow.
- **Rendering**: `data-testid` hooks (`dynamic-action-bar`,
  `dynamic-action-card-${id}`) for tests; `aria-label` on the bar and dismiss
  buttons; `no-drag` so cards stay clickable in a draggable window region.
