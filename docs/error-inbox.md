# Local Error Inbox

The local error inbox is T3 Code's built-in operational triage surface for MCP failures, provider/runtime errors, browser crashes, and other actionable diagnostics.

It is designed to answer two questions:

1. What is currently breaking locally?
2. Which of those failures should become real Orchestrate work?

## What it does

- Captures actionable backend, provider, MCP, websocket, and browser diagnostics.
- Deduplicates repeats into a single inbox entry with an occurrence count.
- Persists the deduplicated inbox in local sqlite state.
- Appends every occurrence to a local NDJSON audit log.
- Exposes the inbox in the Orchestrate UI as a dedicated `inbox` view.
- Lets you manually promote an inbox entry into an Orchestrate task.

This feature is intentionally local-first. It does not send diagnostics to a hosted service.

## Where data lives

The inbox stores data in two places under the configured server `stateDir`:

- SQLite table: `error_inbox_entries`
- Append-only log: `logs/error-inbox.ndjson`

The sqlite table is the current deduplicated view used by the UI. The NDJSON log is the raw local audit trail of each captured occurrence.

## What gets captured

### Server-side capture points

- Provider runtime `runtime.error` events.
- Actionable provider warnings:
  - `config.warning`
  - `mcp.oauth.completed` when `success === false`
- Codex app-server/session failures:
  - `session/startFailed`
  - unexpected `session/exited`
  - provider notification `error`
  - classified stderr/process failures
- Reactor safe-catch paths:
  - `ProviderRuntimeIngestion`
  - `ProviderCommandReactor`
  - `CheckpointReactor`
  - `TaskLifecycleReactor`
- WebSocket request handler failures logged through `wsServer`.

### Browser-side capture points

- `window.error`
- `window.unhandledrejection`
- malformed inbound websocket push payloads that the client drops during decode

Generic `console.error` collection is intentionally out of scope.

## Deduping and fingerprinting

Entries are deduplicated by a normalized fingerprint, not by thread.

Fingerprint inputs include:

- source
- category
- normalized summary/message text
- normalized detail when present
- normalized config path or MCP server name when present in context
- top first-party browser stack frames when available
- provider/error-class details when available

Timestamps, temp-path noise, request IDs, and similar unstable values are stripped so repeated failures collapse into one inbox row.

Browser-side reporting also applies a 5-second duplicate suppression window to avoid flooding the server when the same client-side error loops.

## UI flow

Open Orchestrate and switch the view to `Inbox`.

The inbox view shows:

- unresolved entries by default
- project-scoped entries when a project is selected
- a global/all-projects view for unscoped diagnostics
- entry details including severity, category, source, occurrence count, and first/last seen times

Available actions:

- `Create task`
- `Open task` when the entry is already linked
- `Open thread` when the entry has a thread reference
- `Ignore`
- `Resolve`

Task creation is manual. The inbox does not automatically spin up a fixing thread.

## Task promotion

Promoting an entry creates a normal Orchestrate task with:

- title: `[Error] <entry summary>`
- state: `backlog`
- no auto-start
- a generated brief containing source, category, timestamps, occurrence count, detail, and a compact context excerpt
- default acceptance criteria:
  - root cause identified and fixed
  - original error no longer reproduces
  - related handling/logging updated if needed
  - `bun lint` passes
  - `bun typecheck` passes

If the entry already has a linked task, promotion returns the existing task link instead of creating another one.

## RPC surface

The server exposes the inbox through websocket RPC:

- `server.getErrorInbox`
- `server.reportClientDiagnostic`
- `server.setErrorInboxEntryResolution`
- `server.promoteErrorInboxEntryToTask`

Push updates are sent on:

- `server.errorInboxUpdated`

## Implementation map

Core files:

- Contracts: `packages/contracts/src/errorInbox.ts`
- Server service: `apps/server/src/errorInbox/Layers/ErrorInbox.ts`
- Server repository: `apps/server/src/errorInbox/Layers/ErrorInboxRepository.ts`
- Migration: `apps/server/src/persistence/Migrations/018_ErrorInbox.ts`
- Browser reporter: `apps/web/src/errorInboxReporter.ts`
- Orchestrate UI: `apps/web/src/components/orchestrate/OrchestrateRouteView.tsx`

## Why it exists

T3 Code is local, stateful, and session-heavy. When MCP auth, provider sessions, websocket payloads, or browser runtime code fail, the failure usually needs two things:

- durable local visibility
- a low-friction way to turn the failure into work

The local error inbox exists to make that loop explicit without polluting the main orchestration event store with operational diagnostics.
