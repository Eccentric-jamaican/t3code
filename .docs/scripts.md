# Scripts

- `bun run dev` — Starts contracts, server, and web in `turbo watch` mode.
- `bun run dev:server` — Starts just the WebSocket server (uses Bun TypeScript execution).
- `bun run dev:web` — Starts just the Vite dev server for the web app.
- Dev commands default `T3CODE_STATE_DIR` to `~/.t3/dev` to keep dev state isolated from desktop/prod state.
- Packaged `T3 Code (Mine)` desktop builds use `~/.t3-mine/userdata` by default and no longer fall back to Alpha's `~/.t3/userdata` state.
- Override server CLI-equivalent flags from root dev commands with `--`, for example:
  `bun run dev -- --state-dir ~/.t3/another-dev-state`
- `bun run start` — Runs the production server (serves built web app as static files).
- `bun run build` — Builds contracts, web app, and server through Turbo.
- `bun run typecheck` — Strict TypeScript checks for all packages.
- `bun run test` — Runs workspace tests.
- `bun run dist:desktop:artifact -- --platform <mac|linux|win> --target <target> --arch <arch>` — Builds a desktop artifact for a specific platform/target/arch.
- `bun run dist:desktop:dmg` — Builds a shareable macOS `.dmg` into `./release`.
- `bun run dist:desktop:dmg:x64` — Builds an Intel macOS `.dmg`.
- `bun run dist:desktop:linux` — Builds a Linux AppImage into `./release`.
- `bun run dist:desktop:win` — Builds a Windows NSIS installer into `./release`.

## Desktop `.dmg` packaging notes

- Default build is unsigned/not notarized for local sharing.
- The DMG build uses `assets/macos-icon-1024.png` as the production app icon source.
- Desktop production windows load the bundled UI from `t3://app/index.html` (not a `127.0.0.1` document URL).
- Desktop packaging includes `apps/server/dist` (the `t3` backend) and starts it on loopback with an auth token for WebSocket/API traffic.
- Your tester can still open it on macOS by right-clicking the app and choosing **Open** on first launch.
- To keep staging files for debugging package contents, run: `bun run dist:desktop:dmg -- --keep-stage`
- To allow code-signing/notarization when configured in CI/secrets, add: `--signed`.
- Windows `--signed` uses Azure Trusted Signing and expects:
  `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
  `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, and `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`.
- Azure authentication env vars are also required (for example service principal with secret):
  `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

## Running multiple dev instances

Set `T3CODE_DEV_INSTANCE` to any value to deterministically shift all dev ports together.

- Default ports: server `3773`, web `5733`
- Shifted ports: `base + offset` (offset is hashed from `T3CODE_DEV_INSTANCE`)
- Example: `T3CODE_DEV_INSTANCE=branch-a bun run dev:desktop`

If you want full control instead of hashing, set `T3CODE_PORT_OFFSET` to a numeric offset.

## Chrome MCP UI testing

When you need a clean frontend + backend pair for browser testing, prefer the root dev runner instead of starting `apps/server` and `apps/web` manually.

PowerShell:

```powershell
$env:T3CODE_DEV_INSTANCE = "chrome-mcp"
bun run dev -- --no-browser
```

What to look for:

- The runner prints a line like:
  `[dev-runner] mode=dev ... serverPort=3774 webPort=5734 ...`
- Open Chrome MCP against `http://127.0.0.1:<webPort>/`
- The web app will already point at `ws://localhost:<serverPort>`

Useful variants:

```powershell
# Use a fixed numeric offset instead of a hashed instance name
$env:T3CODE_PORT_OFFSET = "1"
bun run dev -- --no-browser

# Reuse a specific state directory
bun run dev -- --no-browser --state-dir C:\path\to\state

# Resolve the ports without starting processes
bun run dev -- --no-browser --dry-run
```

Guidelines:

- If default ports appear stale or already occupied, do not fight them. Start an isolated instance with `T3CODE_DEV_INSTANCE` or `T3CODE_PORT_OFFSET`.
- Dev commands default `T3CODE_STATE_DIR` to `~/.t3/dev`, so they do not disturb desktop/prod state unless you override it.
- For route-specific checks, open the exact route directly, for example:
  `http://127.0.0.1:<webPort>/orchestrate`
