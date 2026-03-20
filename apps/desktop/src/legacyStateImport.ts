import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { DatabaseSync } from "node:sqlite";

const LEGACY_DESKTOP_STATE_ROOT_DIRNAME = ".t3";
const IMPORT_EXCLUDED_ENTRY_NAMES = new Set(["logs"]);

export type LegacyStateImportReason =
  | "explicit-state-dir"
  | "same-dir"
  | "legacy-missing"
  | "legacy-empty"
  | "target-has-data"
  | "imported";

export interface LegacyStateImportResult {
  readonly imported: boolean;
  readonly reason: LegacyStateImportReason;
  readonly sourceStateDir: string;
  readonly targetStateDir: string;
}

export function resolveLegacyDesktopStateDir(): string {
  return Path.join(OS.homedir(), LEGACY_DESKTOP_STATE_ROOT_DIRNAME, "userdata");
}

function normalizePathForComparison(filePath: string): string {
  return Path.resolve(filePath).replace(/[\\/]+$/u, "").toLowerCase();
}

function readOrchestrationEventCount(stateDir: string): number | null {
  const databasePath = Path.join(stateDir, "state.sqlite");
  if (!FS.existsSync(databasePath)) {
    return 0;
  }

  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database
      .prepare("SELECT COUNT(*) AS count FROM orchestration_events")
      .get() as { count?: number | bigint } | undefined;

    const count = row?.count;
    if (typeof count === "bigint") {
      return Number(count);
    }
    return typeof count === "number" ? count : 0;
  } catch (error) {
    if (error instanceof Error && /no such table: orchestration_events/iu.test(error.message)) {
      return 0;
    }
    return null;
  } finally {
    database?.close();
  }
}

function hasImportableLegacyState(stateDir: string): boolean {
  const count = readOrchestrationEventCount(stateDir);
  return typeof count === "number" && count > 0;
}

function targetAlreadyHasState(stateDir: string): boolean {
  const count = readOrchestrationEventCount(stateDir);
  return count === null || count > 0;
}

function copyLegacyStateContents(sourceStateDir: string, targetStateDir: string): void {
  FS.mkdirSync(targetStateDir, { recursive: true });

  for (const entryName of FS.readdirSync(sourceStateDir)) {
    if (IMPORT_EXCLUDED_ENTRY_NAMES.has(entryName)) {
      continue;
    }

    FS.cpSync(Path.join(sourceStateDir, entryName), Path.join(targetStateDir, entryName), {
      force: true,
      recursive: true,
    });
  }
}

export function importLegacyDesktopStateIfNeeded(input: {
  readonly targetStateDir: string;
  readonly explicitStateDir?: string | null | undefined;
  readonly legacyStateDir?: string;
}): LegacyStateImportResult {
  const sourceStateDir = input.legacyStateDir ?? resolveLegacyDesktopStateDir();
  const targetStateDir = input.targetStateDir;

  if (input.explicitStateDir?.trim()) {
    return {
      imported: false,
      reason: "explicit-state-dir",
      sourceStateDir,
      targetStateDir,
    };
  }

  if (normalizePathForComparison(sourceStateDir) === normalizePathForComparison(targetStateDir)) {
    return {
      imported: false,
      reason: "same-dir",
      sourceStateDir,
      targetStateDir,
    };
  }

  if (!FS.existsSync(sourceStateDir)) {
    return {
      imported: false,
      reason: "legacy-missing",
      sourceStateDir,
      targetStateDir,
    };
  }

  if (!hasImportableLegacyState(sourceStateDir)) {
    return {
      imported: false,
      reason: "legacy-empty",
      sourceStateDir,
      targetStateDir,
    };
  }

  if (targetAlreadyHasState(targetStateDir)) {
    return {
      imported: false,
      reason: "target-has-data",
      sourceStateDir,
      targetStateDir,
    };
  }

  copyLegacyStateContents(sourceStateDir, targetStateDir);

  return {
    imported: true,
    reason: "imported",
    sourceStateDir,
    targetStateDir,
  };
}
