import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { createCodexHomeOverlay } from "./codexHomeOverlay";

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

const tempDirs: string[] = [];

function trackTempDir(dir: string): string {
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createCodexHomeOverlay", () => {
  it("returns the preferred home unchanged outside full-access mode", () => {
    const preferredHomePath = "C:/codex-home";

    expect(
      createCodexHomeOverlay({
        threadId: ThreadId.makeUnsafe("thread-1"),
        projectId: ProjectId.makeUnsafe("project-1"),
        runtimeMode: "approval-required",
        stateDir: "C:/state",
        preferredHomePath,
        bridgeUrl: "http://127.0.0.1:4123/rpc",
        bridgeToken: "secret",
      }),
    ).toBe(preferredHomePath);
  });

  it("returns the preferred home when the desktop browser bridge is unavailable", () => {
    const preferredHomePath = "C:/codex-home";

    expect(
      createCodexHomeOverlay({
        threadId: ThreadId.makeUnsafe("thread-1"),
        projectId: ProjectId.makeUnsafe("project-1"),
        runtimeMode: "full-access",
        stateDir: "C:/state",
        preferredHomePath,
      }),
    ).toBe(preferredHomePath);
  });

  it("copies the base codex home and appends the t3 browser MCP entry", () => {
    const stateDir = trackTempDir(makeTempDir("t3-codex-overlay-state-"));
    const baseHomePath = trackTempDir(makeTempDir("t3-codex-overlay-home-"));
    mkdirSync(path.join(baseHomePath, "nested"), { recursive: true });
    writeFileSync(
      path.join(baseHomePath, "config.toml"),
      ['[profiles.default]', 'model = "gpt-5.4"'].join("\n"),
      "utf8",
    );
    writeFileSync(path.join(baseHomePath, "nested", "keep.txt"), "preserve me", "utf8");

    const overlayPath = createCodexHomeOverlay({
      threadId: ThreadId.makeUnsafe("thread-1"),
      projectId: ProjectId.makeUnsafe("project-1"),
      runtimeMode: "full-access",
      stateDir,
      preferredHomePath: baseHomePath,
      bridgeUrl: "http://127.0.0.1:4123/rpc",
      bridgeToken: "secret-token",
    });

    expect(overlayPath).toBeTruthy();
    expect(overlayPath).not.toBe(baseHomePath);

    const configToml = readFileSync(path.join(overlayPath!, "config.toml"), "utf8");
    expect(configToml).toContain('[profiles.default]\nmodel = "gpt-5.4"');
    expect(configToml).toContain("[mcp_servers.t3_browser]");
    expect(configToml).toContain('command = "');
    expect(configToml).toContain('args = ["');
    expect(configToml).toContain('T3_BROWSER_BRIDGE_URL = "http://127.0.0.1:4123/rpc"');
    expect(configToml).toContain('T3_BROWSER_BRIDGE_TOKEN = "secret-token"');
    expect(configToml).toContain('T3_BROWSER_PROJECT_ID = "project-1"');
    expect(configToml).toContain('T3_BROWSER_THREAD_ID = "thread-1"');
    expect(readFileSync(path.join(overlayPath!, "nested", "keep.txt"), "utf8")).toBe("preserve me");
  });
});
