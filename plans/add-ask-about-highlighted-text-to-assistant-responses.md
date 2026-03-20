# Add “Ask About Highlighted Text” to Assistant Responses

## Summary

Add a text-selection workflow to the chat so users can highlight text inside assistant-rendered output, click a small floating action near the selection, and have that selection inserted into the existing composer as quoted context for a follow-up question.

This will apply only to assistant output surfaces:
- normal assistant markdown responses
- rendered proposed-plan cards / assistant markdown-like output

It will not apply to:
- the user’s own message bubbles
- the composer/editor itself
- sidebar or other app chrome

The interaction should match the screenshots conceptually:
1. user highlights assistant text
2. a small floating action appears near the selection
3. clicking it prefills the composer with the selected text as quote/context
4. the composer receives focus so the user can type their question and send it manually

## User Intent and Success Criteria

Goal:
- let users ask about a specific passage without copying and pasting manually

Success criteria:
- highlighting assistant text reliably shows an action affordance
- clicking the action inserts the selected text into the composer in a clean readable format
- focus moves to the composer with the cursor placed at the end of the inserted content
- existing composer text is preserved in a predictable way
- the feature does not interfere with normal scrolling, copy selection, links, or code-copy buttons
- the feature works for assistant responses and plan cards only

## Implementation Approach

### 1. Introduce a selection-action controller in `ChatView`

Add a local selection controller in [ChatView.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx) that owns:
- current selected text
- selected range screen rect
- whether the selection is eligible
- which assistant-output container owns the selection

This controller should listen to document-level selection lifecycle events:
- `selectionchange`
- `mouseup`
- `touchend`
- `scroll` and `resize` for reposition/hide behavior

Core behavior:
- read `window.getSelection()`
- reject empty or collapsed selections
- reject selections not fully contained within an eligible assistant-output region
- reject selections inside non-content controls like buttons
- normalize the selected text before display/insertion
- compute overlay position from `Range.getBoundingClientRect()`

Render the floating action as a small fixed-position overlay inside `ChatView`, ideally via a portal to `document.body` so it is not clipped by scroll containers.

### 2. Mark assistant-rendered regions as selection-eligible

Mark only assistant output containers as eligible regions with a stable attribute such as:
- `data-chat-selection-region="assistant-output"`

Apply this to:
- assistant message markdown container
- proposed-plan markdown container

Do not mark:
- user message bubbles
- composer
- tool call/status chrome
- action rows and metadata rows

This keeps the scope explicit and avoids selection leakage into unrelated UI.

### 3. Add a small floating “ask about selection” button

When there is a valid selection, show a floating action near the selection bounds.

Recommended behavior:
- icon-first button with accessible label like `Ask about selected text`
- positioned slightly below/right of the selection when space allows
- flips above/left when near viewport edges
- hides immediately when selection collapses, becomes invalid, or the user clicks elsewhere
- remains visible during the short transition from mouseup to click on the floating action

Implementation detail:
- prevent the overlay itself from destroying the selection before click handling completes
- use `pointerdown` on the floating action to capture intent before the browser clears selection

### 4. Prefill the composer using quoted context

When the floating action is clicked:
- capture the normalized selected text
- clear the floating action state
- insert a formatted quote block into the existing composer draft
- focus the composer and place the cursor at the end so the user can continue typing

Default formatting:
- if composer is empty:
  ```md
  > selected line 1
  > selected line 2
  
  ```
- if composer already has text:
  append two newlines, then the quoted selection, then two trailing newlines

This preserves whatever the user was already writing while adding the selected context predictably.

Do not auto-send.
Do not generate a question automatically.
Do not replace existing composer text.

### 5. Extract prompt-formatting logic into a small helper

Add a small pure helper in web code for quote insertion formatting, rather than embedding string manipulation inline in `ChatView`.

Suggested responsibility:
- normalize selection whitespace
- split lines
- prefix each line with `> `
- merge with existing composer text using predictable spacing rules

This keeps the feature testable and avoids duplicating prompt-format logic later if more “insert context into composer” actions are added.

### 6. Reuse existing composer focus/update flow

Use the existing imperative composer integration in [ChatView.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx) and [ComposerPromptEditor.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ComposerPromptEditor.tsx):
- update the draft prompt through the same state path as normal editing
- update cursor state
- call `composerEditorRef.current?.focusAt(...)` after insertion

Do not bypass current draft/state flow.
Do not create a second temporary prompt input.

### 7. Keep selection logic isolated from markdown rendering

Do not make `ChatMarkdown` responsible for global selection management.

Preferred structure:
- `ChatView` owns the selection controller and floating action
- `ChatMarkdown` remains focused on rendering markdown
- assistant-output wrappers expose eligibility via `data-` attributes

Only add props to `ChatMarkdown` if needed for container attributes or stable selection-region IDs. Otherwise keep its API unchanged.

## Data Flow

1. Assistant markdown renders inside an eligible region.
2. User selects text inside that region.
3. Selection controller validates:
   - non-empty text
   - within assistant-output region
   - not inside excluded controls
4. Controller stores:
   - selected text
   - active region id/type
   - range rect for overlay placement
5. Floating action renders near the selection.
6. User clicks action.
7. Controller formats selected text as blockquote context.
8. `ChatView` appends it to the composer draft.
9. Composer is focused with cursor at the end.
10. DOM selection is cleared and overlay disappears.

## Important Changes to Public APIs / Interfaces / Types

No cross-package API or contract changes are required.

Local component/interface changes likely needed:
- optional local `data-` attributes on assistant output containers
- possibly a small local helper type for selection state, for example:
  - selected text
  - anchor rect
  - region kind/id

If `ChatMarkdown` needs configuration for region tagging, add a local prop only within `apps/web`, not a shared package contract.

## Edge Cases and Failure Modes

Handle these explicitly:

- Collapsed selection:
  hide overlay

- Selection outside assistant output:
  hide overlay

- Selection spanning assistant output and non-eligible UI:
  reject it and hide overlay

- Selection consisting only of whitespace/newlines:
  hide overlay

- Selection in code blocks:
  allow it if the text is selectable and inside eligible assistant output

- Selection on links:
  allow text selection; do not break normal link clicking when no selection is active

- Clicking code-copy buttons or other controls:
  must not trigger overlay

- Scroll after selection:
  reposition overlay if the selection remains valid; otherwise hide

- Streaming assistant message updates:
  if the underlying selected node changes materially, hide the overlay rather than trying to preserve stale selection state

- Existing composer content:
  preserve it and append quoted selection with spacing normalization

- Pending approval / pending user-input composer modes:
  insertion should still use the active composer path, not bypass it

- Mobile/touch:
  support browser-native text selection where available; if reliable range rects are unavailable in a specific environment, fail gracefully by not showing the action

## Testing and Validation

### Unit tests

Add pure tests for the quote-formatting helper:
- empty composer + single-line selection
- empty composer + multi-line selection
- existing composer content + appended selection
- whitespace trimming/normalization
- selection containing blank lines

### Browser/component tests

Add browser-level tests in the existing chat browser test surface, likely [ChatView.browser.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.browser.tsx):
- selecting assistant text shows the floating action
- selecting user-message text does not show the action
- clicking the action inserts quoted selection into the composer
- composer receives focus after insertion
- existing composer content is preserved when selection is inserted
- collapsing the selection hides the action
- selection in a proposed-plan card also shows the action
- scrolling after selection does not leave a stale floating button stranded on screen

### Manual scenarios

Validate manually:
- normal assistant paragraph selection
- list-item selection
- multi-paragraph selection
- code-block selection
- long selection near viewport edges
- selection while message is still streaming
- selection followed by click on link/copy button
- desktop app and browser app behavior

### Required checks after implementation

- `bun lint`
- `bun typecheck`

## Assumptions and Defaults

Chosen defaults for implementation:
- scope is assistant outputs only
- action prefills the existing composer; it does not auto-send
- selected text is inserted as Markdown blockquote context
- existing composer text is preserved and selection is appended
- the action is a floating button near the text selection, not a context menu replacement
- no server, IPC, or contracts changes are needed for the first version
- no special AI-generated prompt template is added in v1; the user writes the question after insertion

## Suggested File Touch Points

Primary files likely involved:
- [ChatView.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx)
- [ChatMarkdown.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatMarkdown.tsx)
- [ChatView.browser.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.browser.tsx)
- a new small helper in `apps/web/src` for formatting selected text into composer-ready quote blocks

## Out of Scope for This Version

Do not include in v1:
- auto-generated questions like “What does this mean?”
- auto-send on selection action
- selection actions on user messages
- multi-action popovers with summarize/explain/rewrite variants
- persistence of highlights
- annotation storage or comment threads tied to specific selections
