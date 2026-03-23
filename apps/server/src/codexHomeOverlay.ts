import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import type { ProjectId, RuntimeMode, ThreadId } from "@t3tools/contracts";

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function resolveBrowserMcpServerPath(): string {
  return fileURLToPath(new URL("./browserMcpServer.mjs", import.meta.url));
}

function resolveBaseCodexHome(preferredHomePath?: string): string {
  const normalizedPreferred = preferredHomePath?.trim();
  if (normalizedPreferred) {
    return normalizedPreferred;
  }
  const envHome = process.env.CODEX_HOME?.trim();
  if (envHome) {
    return envHome;
  }
  return Path.join(OS.homedir(), ".codex");
}

function buildBrowserMcpBlock(input: {
  bridgeUrl: string;
  bridgeToken: string;
  projectId: ProjectId;
  threadId: ThreadId;
}): string {
  return [
    "",
    "[mcp_servers.t3_browser]",
    `command = "${escapeTomlString(process.execPath)}"`,
    `args = ["${escapeTomlString(resolveBrowserMcpServerPath())}"]`,
    "startup_timeout_sec = 20",
    "tool_timeout_sec = 120",
    "[mcp_servers.t3_browser.env]",
    `T3_BROWSER_BRIDGE_URL = "${escapeTomlString(input.bridgeUrl)}"`,
    `T3_BROWSER_BRIDGE_TOKEN = "${escapeTomlString(input.bridgeToken)}"`,
    `T3_BROWSER_PROJECT_ID = "${escapeTomlString(String(input.projectId))}"`,
    `T3_BROWSER_THREAD_ID = "${escapeTomlString(String(input.threadId))}"`,
    "",
  ].join("\n");
}

export interface CodexHomeOverlayInput {
  threadId: ThreadId;
  projectId: ProjectId;
  runtimeMode: RuntimeMode;
  stateDir: string;
  preferredHomePath?: string | undefined;
  bridgeUrl?: string | undefined;
  bridgeToken?: string | undefined;
}

export function createCodexHomeOverlay(input: CodexHomeOverlayInput): string | undefined {
  if (input.runtimeMode !== "full-access") {
    return input.preferredHomePath;
  }
  const bridgeUrl = input.bridgeUrl?.trim();
  const bridgeToken = input.bridgeToken?.trim();
  if (!bridgeUrl || !bridgeToken) {
    return input.preferredHomePath;
  }

  const baseHomePath = resolveBaseCodexHome(input.preferredHomePath);
  const overlayDir = Path.join(
    input.stateDir,
    "codex-home-overlays",
    `${sanitizeSegment(String(input.threadId))}-${Date.now()}`,
  );
  FS.mkdirSync(overlayDir, { recursive: true });

  if (FS.existsSync(baseHomePath)) {
    FS.cpSync(baseHomePath, overlayDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
  }

  const configPath = Path.join(overlayDir, "config.toml");
  const existingConfig = FS.existsSync(configPath) ? FS.readFileSync(configPath, "utf8") : "";
  const nextConfig = `${existingConfig.trimEnd()}${buildBrowserMcpBlock({
    bridgeUrl,
    bridgeToken,
    projectId: input.projectId,
    threadId: input.threadId,
  })}`;
  FS.writeFileSync(configPath, nextConfig, "utf8");
  return overlayDir;
}
