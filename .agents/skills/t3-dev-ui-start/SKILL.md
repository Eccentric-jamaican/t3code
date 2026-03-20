---
name: t3-dev-ui-start
description: Start the T3 Code web UI and websocket backend for local development or Chrome MCP testing. Use this when asked to run the app, spin up frontend and backend together, open the UI in a browser, or attach a clean dev frontend to a working local backend in this repository.
---

Use the repo dev runner. Do not manually juggle `apps/server` and `apps/web` unless there is a specific reason.

Preferred command for a clean browser-testing pair:

```powershell
$env:T3CODE_DEV_INSTANCE = "chrome-mcp"
bun run dev -- --no-browser
```

Read the first `[dev-runner]` log line. It prints the resolved `serverPort` and `webPort`.

Then:

- open `http://127.0.0.1:<webPort>/` in Chrome MCP
- use route-specific URLs directly when needed, for example `http://127.0.0.1:<webPort>/orchestrate`
- expect the frontend to connect to `ws://localhost:<serverPort>` automatically

If the default ports are busy or stale:

- prefer `T3CODE_DEV_INSTANCE=<name>` for a deterministic isolated pair
- or set `T3CODE_PORT_OFFSET=<n>` for a fixed offset

Useful variants:

```powershell
# fixed offset
$env:T3CODE_PORT_OFFSET = "1"
bun run dev -- --no-browser

# inspect the chosen ports without starting processes
bun run dev -- --no-browser --dry-run

# run only one side when that is explicitly needed
bun run dev:server -- --no-browser
bun run dev:web
```

Notes:

- dev state defaults to `~/.t3/dev`; pass `--state-dir <path>` if you need a different state snapshot
- if the browser shows repeated websocket handshake failures, stop reusing the stale pair and start an isolated dev instance instead
