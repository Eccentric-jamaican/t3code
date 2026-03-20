# Quick start

```bash
# Development (with hot reload)
bun run dev

# Development for Chrome MCP / manual browser testing without auto-open
bun run dev -- --no-browser

# Desktop development
bun run dev:desktop

# Desktop development on an isolated port set
T3CODE_DEV_INSTANCE=feature-xyz bun run dev:desktop

# Production
bun run build
bun run start

# Build a shareable macOS .dmg (arm64 by default)
bun run dist:desktop:dmg

# Or from any project directory after publishing:
npx t3
```

For isolated browser testing, see `.docs/scripts.md`.
