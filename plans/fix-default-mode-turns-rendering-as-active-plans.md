# Fix Default-Mode Turns Rendering as Active Plans

## Summary

Fix the bug where `ChatView` can render an active plan panel for a turn that was started in default/chat mode if the model emits `turn.plan.updated` internally.

This is happening in thread `9022fbed-af57-44b6-aa90-40b2b0119a00` today:
- the thread is currently `interaction_mode = "default"`
- the event store contains both plan-mode and default-mode `thread.turn-start-requested` events
- `projection_thread_activities` contains a `turn.plan.updated` for default-mode turn `019cef82-72c3-7fc3-841a-0cb6cabf1e44`
- `ChatView` derives `activePlan` only from `latestTurnId`, not from the turn’s actual interaction mode

Chosen product behavior:
- Preserve historical proposed-plan cards in the timeline
- Only suppress the active/in-progress plan UI for turns that were not started in plan mode
- Implement a turn-scoped fix, not a thread-level UI band-aid

## Root Cause

The orchestration event already knows the turn interaction mode:
- `thread.turn-start-requested` payload includes `interactionMode`

But the projection/snapshot stack drops that information:
- `projection_turns` does not store turn interaction mode
- `OrchestrationLatestTurn` does not expose turn interaction mode
- web `Thread.latestTurn` mirrors that incomplete shape
- `deriveActivePlanState(...)` therefore cannot distinguish:
  - an explicit plan-mode turn
  - a default-mode implementation turn that internally emitted plan updates

## Important API / Type Changes

### Public contracts
Extend [`packages/contracts/src/orchestration.ts`](/C:/Users/Addis/source/repos/t3code-main/packages/contracts/src/orchestration.ts):

- Add `interactionMode: ProviderInteractionMode` to `OrchestrationLatestTurn`
- Keep decoding default as `"default"` for backward compatibility when older snapshots are read

This change flows through:
- [`apps/web/src/types.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/types.ts)
- any snapshot decoding paths that materialize `Thread.latestTurn`

### Persistence / projection types
Extend [`apps/server/src/persistence/Services/ProjectionTurns.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/persistence/Services/ProjectionTurns.ts):

- Add `interactionMode: ProviderInteractionMode` to `ProjectionTurn`
- Add `interactionMode: ProviderInteractionMode` to `ProjectionTurnById`
- Add `interactionMode: ProviderInteractionMode` to `ProjectionPendingTurnStart`

## Implementation Plan

### 1. Persist turn interaction mode in `projection_turns`
Add a new migration:
- [`apps/server/src/persistence/Migrations/014_ProjectionTurnsInteractionMode.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/persistence/Migrations/014_ProjectionTurnsInteractionMode.ts)

Migration actions:
1. Add `interaction_mode TEXT NOT NULL DEFAULT 'default'` to `projection_turns`
2. Backfill existing rows by matching:
   - `projection_turns.thread_id = orchestration_events.stream_id`
   - `projection_turns.pending_message_id = json_extract(orchestration_events.payload_json, '$.messageId')`
   - `orchestration_events.event_type = 'thread.turn-start-requested'`
3. Set `projection_turns.interaction_mode` from:
   - `json_extract(payload_json, '$.interactionMode')`
4. Leave unmatched rows at default `"default"`

Reason for this exact backfill:
- existing buggy threads already have the required source data
- in your thread, `projection_turns.pending_message_id` lines up cleanly with the `thread.turn-start-requested` event payload `messageId`

Update migration registration in [`apps/server/src/persistence/Migrations.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/persistence/Migrations.ts).

### 2. Thread the field through the projection repository
Update [`apps/server/src/persistence/Layers/ProjectionTurns.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/persistence/Layers/ProjectionTurns.ts):

- include `interaction_mode` in:
  - insert/upsert SQL
  - pending insert SQL
  - list/get selects
- map DB field to `interactionMode`

### 3. Preserve interaction mode at turn-start time
Update [`apps/server/src/orchestration/Layers/ProjectionPipeline.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/orchestration/Layers/ProjectionPipeline.ts):

On `thread.turn-start-requested`:
- store `interactionMode` in the pending turn-start row

On `thread.session-set` when converting pending -> running:
- propagate `pendingTurnStart.interactionMode` into the persisted turn row
- if an existing turn row already exists, preserve its interactionMode unless missing/defaulted and pending data is available

On fallback row creation paths that can materialize a turn without the pending row:
- `thread.message-sent`
- `thread.turn-interrupt-requested`
- any other orphan turn-row creation path
- set `interactionMode` to:
  - existing row value if present
  - otherwise `"default"`

Do not attempt to infer plan mode from activity kinds. The source of truth is the turn-start request.

### 4. Surface latest turn interaction mode in the snapshot
Update snapshot read models so the latest turn carries the stored mode.

Files:
- [`apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts)
- [`packages/contracts/src/orchestration.ts`](/C:/Users/Addis/source/repos/t3code-main/packages/contracts/src/orchestration.ts)
- [`apps/web/src/types.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/types.ts)

Changes:
- include `interactionMode` in the turn-row selection used to build `latestTurn`
- populate `latestTurn.interactionMode`
- ensure decode compatibility for older snapshots by defaulting missing values to `"default"`

### 5. Gate active plan UI by latest turn interaction mode
Fix the web derivation at the source, not inside the badge component.

Update [`apps/web/src/session-logic.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/session-logic.ts):

Change `deriveActivePlanState(...)` so it requires both:
- `latestTurnId`
- `latestTurnInteractionMode`

New behavior:
- if there is no `latestTurnId`, return `null`
- if `latestTurnInteractionMode !== "plan"`, return `null`
- otherwise keep the current logic of selecting the latest `turn.plan.updated` for that turn

Recommended signature:
- `deriveActivePlanState(activities, latestTurnId, latestTurnInteractionMode)`

Update all callers accordingly, primarily in [`apps/web/src/components/ChatView.tsx`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx).

This makes the fix explicit and testable in shared UI logic instead of spreading ad hoc UI guards around `PlanModePanel`.

### 6. Keep historical proposed-plan cards untouched
Do not change:
- `findLatestProposedPlan(...)`
- timeline proposed-plan entries
- historical proposed-plan card rendering in [`apps/web/src/components/chat/MessagesTimeline.tsx`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/chat/MessagesTimeline.tsx)

Rationale:
- user chose to preserve plan history
- the bug is the active plan panel on a default-mode turn, not the existence of historical plan artifacts

## Files Expected To Change

### Contracts / web types
- [`packages/contracts/src/orchestration.ts`](/C:/Users/Addis/source/repos/t3code-main/packages/contracts/src/orchestration.ts)
- [`apps/web/src/types.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/types.ts)

### Server persistence / projection
- [`apps/server/src/persistence/Migrations.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/persistence/Migrations.ts)
- [`apps/server/src/persistence/Migrations/014_ProjectionTurnsInteractionMode.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/persistence/Migrations/014_ProjectionTurnsInteractionMode.ts)
- [`apps/server/src/persistence/Services/ProjectionTurns.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/persistence/Services/ProjectionTurns.ts)
- [`apps/server/src/persistence/Layers/ProjectionTurns.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/persistence/Layers/ProjectionTurns.ts)
- [`apps/server/src/orchestration/Layers/ProjectionPipeline.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/orchestration/Layers/ProjectionPipeline.ts)
- [`apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts)

### Web logic / UI
- [`apps/web/src/session-logic.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/session-logic.ts)
- [`apps/web/src/components/ChatView.tsx`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.tsx)

### Tests
- [`apps/web/src/session-logic.test.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/session-logic.test.ts)
- [`apps/web/src/components/ChatView.browser.tsx`](/C:/Users/Addis/source/repos/t3code-main/apps/web/src/components/ChatView.browser.tsx)
- server projection/snapshot tests in:
  - [`apps/server/src/orchestration/Layers/ProjectionPipeline.test.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/orchestration/Layers/ProjectionPipeline.test.ts)
  - [`apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts`](/C:/Users/Addis/source/repos/t3code-main/apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts)

## Test Cases And Scenarios

### Server migration / projection tests
1. Migration backfills `projection_turns.interaction_mode` from `orchestration_events.payload_json.interactionMode` using `pending_message_id`
2. Existing rows without a matching event default to `"default"`
3. `thread.turn-start-requested` stores pending turn interaction mode
4. `thread.session-set` carries pending interaction mode into the resolved turn row
5. `ProjectionSnapshotQuery` includes `latestTurn.interactionMode`

### Web logic tests
Add focused tests for `deriveActivePlanState(...)`:
1. returns plan state for latest turn when `latestTurnInteractionMode === "plan"`
2. returns `null` for the same activities when `latestTurnInteractionMode === "default"`
3. ignores older plan-mode turns when the latest turn is default
4. returns `null` when `latestTurnId` is absent

### Browser/UI tests
Add or update browser coverage so `ChatView` behavior is explicit:
1. default-mode thread with latest-turn `turn.plan.updated` does not render the active plan panel
2. plan-mode thread with latest-turn `turn.plan.updated` still renders the active plan panel
3. historical proposed-plan timeline card remains visible after a later default-mode implementation turn
4. plan follow-up banner behavior remains unchanged for explicit plan-mode threads

### Regression check using the real thread shape
Model a fixture based on thread `9022fbed-af57-44b6-aa90-40b2b0119a00`:
- earlier plan-mode proposed plan turn
- later default-mode implementation turn with `turn.plan.updated`
- verify no active plan panel renders for the later turn

## Acceptance Criteria

The bug is fixed when:
- a latest turn started in default mode never shows the active plan panel, even if the model emitted `turn.plan.updated`
- a latest turn started in plan mode still shows the active plan panel
- historical proposed-plan cards remain in the timeline
- existing persisted threads, including `9022fbed-af57-44b6-aa90-40b2b0119a00`, are corrected by migration/backfill without requiring a new turn
- `bun lint` passes
- `bun typecheck` passes

## Assumptions And Defaults Chosen

- Chosen fix shape: turn-scoped fix
- Chosen historical behavior: keep proposed-plan history visible
- `turn.plan.updated` remains a valid runtime activity; the bug is in presentation context, not event ingestion
- Backfill source of truth is `orchestration_events.event_type = 'thread.turn-start-requested'`
- Backfill join key is `projection_turns.pending_message_id = payload_json.messageId`
- Rows that cannot be backfilled default to `"default"`
- The fix should be centralized in projection + shared session logic, not implemented as a one-off UI conditional in `PlanModePanel`
