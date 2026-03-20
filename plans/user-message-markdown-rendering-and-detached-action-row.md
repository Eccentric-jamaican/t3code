# User Message Markdown Rendering And Detached Action Row

## Summary
Fix the user-authored chat bubble in `apps/web` so pasted raw markdown renders as formatted markdown instead of literal text, and move the user-message action controls out of the bubble into a separate row below/right of it.

This plan uses the existing shared markdown renderer and keeps the change conservative:
- User messages gain markdown rendering.
- User messages keep only their existing actions (`copy`, `revert` when available).
- User messages do **not** gain quote/pin text-selection actions.
- No server, protocol, or contract changes.

## Chosen Defaults
- Markdown scope: `Conservative`.
- Action layout: `Hover below`.
- Selection behavior: unchanged; user-authored messages remain excluded from selection overlay actions.
- Scope boundary: `apps/web` only.

## Important API / Interface Changes
No public API, server API, or shared-contract changes.

Internal component changes:
- `ChatMarkdown` in [apps/web/src/components/ChatMarkdown.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatMarkdown.tsx) should gain a small internal appearance prop for message-context styling:
  - `variant?: "assistant" | "user"`
- Default remains `"assistant"` so existing assistant/proposed-plan usage is unchanged.
- User rendering in [apps/web/src/components/ChatView.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx) will pass `variant="user"`.

## Implementation Plan

### 1. Reuse the shared markdown pipeline for user messages
In [apps/web/src/components/ChatView.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx):
- Replace the current user-message `<pre>` block with `ChatMarkdown`.
- Preserve the existing user bubble container, attachment grid, width cap, and right alignment.
- Do **not** add `data-chat-selection-region` attributes to user messages.

Result:
- Headings, lists, code fences, inline code, blockquotes, links, and tables render the same way as assistant/proposed-plan content.
- User messages still behave as authored input, not selectable assistant output.

### 2. Add a user-specific markdown presentation variant
In [apps/web/src/components/ChatMarkdown.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatMarkdown.tsx):
- Add `variant?: "assistant" | "user"` to the props.
- Apply a variant class on the root element, for example:
  - `chat-markdown`
  - `chat-markdown-user` when `variant="user"`

In [apps/web/src/index.css](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/index.css):
- Keep the current shared markdown rules as the base.
- Add a compact user-bubble override set for `.chat-markdown-user`:
  - Use foreground color appropriate for the bubble.
  - Tighten block spacing slightly versus assistant output so the bubble stays compact.
  - Preserve wrapping behavior.
  - Keep code blocks, inline code, links, and tables visually contained inside the bubble.
  - Ensure first/last child margin trimming still applies cleanly.

Do not create a second markdown renderer. The goal is one parser/render pipeline with lightweight visual variants.

### 3. Move the action buttons outside the bubble
In [apps/web/src/components/ChatView.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx):
- Change the user-message layout from:
  - actions and timestamp inside the bubble footer
- To:
  - bubble as one element
  - a separate metadata/action row immediately below it, aligned right, outside the bubble

Specific structure:
- Keep the outer `flex justify-end` row wrapper.
- Wrap bubble + footer row in a right-aligned column container.
- The footer row contains:
  - left side: hover/focus-revealed action group (`copy`, optional `revert`)
  - right side: timestamp
- The footer row width should visually track the bubble width rather than spanning full timeline width.

Behavior:
- Actions remain hidden by default and appear on bubble hover or control focus, matching current behavior.
- Keyboard focus on the buttons must still reveal the action row.
- Revert button enable/disable behavior remains unchanged.

### 4. Keep virtualization predictable
In [apps/web/src/components/timelineHeight.ts](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/timelineHeight.ts):
- Keep the existing user estimator branch rather than collapsing user and assistant logic together.
- Tune only if needed after implementing the compact user-markdown styling.
- The target is to preserve current estimate accuracy for long user messages and avoid regressions in existing viewport-based tests.

Implementation rule:
- Do not introduce markdown parsing into the estimator.
- First rely on the compact user markdown style staying close to the existing user text geometry.
- Only if measurements show meaningful drift, adjust the user constants conservatively:
  - `USER_LINE_HEIGHT_PX`
  - `USER_BASE_HEIGHT_PX`
  - `USER_MONO_AVG_CHAR_WIDTH_PX` replacement if the final typography changes materially

## File-Level Work
- [apps/web/src/components/ChatView.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx)
  - Swap user `<pre>` for `ChatMarkdown`
  - Restructure user row footer so actions render below the bubble
- [apps/web/src/components/ChatMarkdown.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatMarkdown.tsx)
  - Add `variant` prop
  - Emit variant class names
- [apps/web/src/index.css](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/index.css)
  - Add `.chat-markdown-user` overrides
- [apps/web/src/components/ChatView.browser.tsx](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.browser.tsx)
  - Update/add browser tests for user markdown rendering and detached action row
- [apps/web/src/components/timelineHeight.test.ts](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/timelineHeight.test.ts)
  - Only update if the final geometry requires estimator constant changes

## Test Cases And Scenarios

### Rendering
- User message containing markdown heading, list, blockquote, inline code, and fenced code block renders as formatted HTML, not literal markdown text.
- User message with plain text still renders correctly and preserves wrapping behavior.
- User message with attachments plus markdown text still renders attachments first and text below without layout breakage.

### Action Row Layout
- Copy/revert controls render in a sibling footer row below the bubble, not inside the bubble body.
- The footer row stays right-aligned under the user bubble.
- Actions appear on hover and remain accessible on keyboard focus.
- Timestamp remains in the footer row and no longer shares the markdown content flow.

### Interaction Safety
- User-authored messages still do not show `Quote selected text` or `Pin selected text`.
- Assistant/proposed-plan selection behavior remains unchanged.
- Copy button still copies the raw message text source, not flattened rendered DOM text.

### Virtualization / Sizing
- Existing long-user-message viewport tests continue to pass or are updated only for narrowly justified constant tuning.
- Add one browser test for a markdown-heavy user message to confirm the row remains measurable and visible in the virtualized region without obvious overflow/collapse.

### Regression Coverage
- Assistant message rendering remains unchanged.
- Proposed plan rendering/actions remain unchanged.

## Verification
Run:
- `bun lint`
- `bun typecheck`

Do not run `bun test`; if implementation is later executed and tests are needed, use `bun run test`.

## Assumptions
- The desired markdown behavior is parity with the existing shared renderer, not a custom/simplified user-only parser.
- The desired visual reference for actions is the second screenshot: detached beneath the bubble, aligned to the right.
- Hover-revealed actions are preferred over always-visible controls to keep the row visually quiet.
- No change is wanted to the current product rule that only assistant/proposed-plan content participates in quote/pin selection actions.
