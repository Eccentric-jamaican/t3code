import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  importLegacyDesktopStateIfNeeded,
  resolveLegacyDesktopStateDir,
} from "./legacyStateImport";

const tempRoots: string[] = [];

function makeTempDir(): string {
  const dir = FS.mkdtempSync(Path.join(OS.tmpdir(), "t3-desktop-state-import-"));
  tempRoots.push(dir);
  return dir;
}

function seedStateDir(
  stateDir: string,
  options: {
    readonly eventCount: number;
    readonly keybindings?: string;
    readonly attachmentText?: string;
  },
): void {
  FS.mkdirSync(stateDir, { recursive: true });

  const database = new DatabaseSync(Path.join(stateDir, "state.sqlite"));
  database.exec(`
    CREATE TABLE IF NOT EXISTS orchestration_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE
    );
  `);

  for (let index = 0; index < options.eventCount; index += 1) {
    database
      .prepare("INSERT INTO orchestration_events (event_id) VALUES (?)")
      .run(`event-${index + 1}`);
  }
  database.close();

  FS.writeFileSync(
    Path.join(stateDir, "keybindings.json"),
    options.keybindings ?? JSON.stringify({ source: "default" }),
    "utf8",
  );

  if (options.attachmentText) {
    const attachmentsDir = Path.join(stateDir, "attachments");
    FS.mkdirSync(attachmentsDir, { recursive: true });
    FS.writeFileSync(Path.join(attachmentsDir, "context.txt"), options.attachmentText, "utf8");
  }
}

function readEventCount(stateDir: string): number {
  const database = new DatabaseSync(Path.join(stateDir, "state.sqlite"), { readOnly: true });
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM orchestration_events")
    .get() as { count: number };
  database.close();
  return row.count;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (dir) {
      FS.rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("resolveLegacyDesktopStateDir", () => {
  it("points at the shared legacy desktop state root", () => {
    expect(resolveLegacyDesktopStateDir()).toBe(Path.join(OS.homedir(), ".t3", "userdata"));
  });
});

describe("importLegacyDesktopStateIfNeeded", () => {
  it("imports legacy state into an empty target state dir", () => {
    const root = makeTempDir();
    const legacyStateDir = Path.join(root, "legacy");
    const targetStateDir = Path.join(root, "mine");

    seedStateDir(legacyStateDir, {
      eventCount: 2,
      keybindings: JSON.stringify({ source: "legacy" }),
      attachmentText: "legacy attachment",
    });
    seedStateDir(targetStateDir, {
      eventCount: 0,
      keybindings: JSON.stringify({ source: "target" }),
    });

    const result = importLegacyDesktopStateIfNeeded({
      targetStateDir,
      legacyStateDir,
    });

    expect(result).toEqual({
      imported: true,
      reason: "imported",
      sourceStateDir: legacyStateDir,
      targetStateDir,
    });
    expect(readEventCount(targetStateDir)).toBe(2);
    expect(FS.readFileSync(Path.join(targetStateDir, "keybindings.json"), "utf8")).toBe(
      JSON.stringify({ source: "legacy" }),
    );
    expect(FS.readFileSync(Path.join(targetStateDir, "attachments", "context.txt"), "utf8")).toBe(
      "legacy attachment",
    );
  });

  it("does not overwrite a target state dir that already has events", () => {
    const root = makeTempDir();
    const legacyStateDir = Path.join(root, "legacy");
    const targetStateDir = Path.join(root, "mine");

    seedStateDir(legacyStateDir, {
      eventCount: 2,
      keybindings: JSON.stringify({ source: "legacy" }),
    });
    seedStateDir(targetStateDir, {
      eventCount: 1,
      keybindings: JSON.stringify({ source: "target" }),
    });

    const result = importLegacyDesktopStateIfNeeded({
      targetStateDir,
      legacyStateDir,
    });

    expect(result.reason).toBe("target-has-data");
    expect(result.imported).toBe(false);
    expect(readEventCount(targetStateDir)).toBe(1);
    expect(FS.readFileSync(Path.join(targetStateDir, "keybindings.json"), "utf8")).toBe(
      JSON.stringify({ source: "target" }),
    );
  });

  it("skips the import when an explicit state dir override is provided", () => {
    const root = makeTempDir();
    const legacyStateDir = Path.join(root, "legacy");
    const targetStateDir = Path.join(root, "mine");

    seedStateDir(legacyStateDir, { eventCount: 3 });

    const result = importLegacyDesktopStateIfNeeded({
      targetStateDir,
      legacyStateDir,
      explicitStateDir: targetStateDir,
    });

    expect(result).toEqual({
      imported: false,
      reason: "explicit-state-dir",
      sourceStateDir: legacyStateDir,
      targetStateDir,
    });
    expect(FS.existsSync(Path.join(targetStateDir, "state.sqlite"))).toBe(false);
  });
});
