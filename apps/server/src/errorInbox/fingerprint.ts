import { createHash } from "node:crypto";

import type {
  ErrorInboxCategory,
  ErrorInboxSeverity,
  ErrorInboxSource,
  ProviderKind,
  ProjectId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

type FingerprintInput = {
  readonly source: ErrorInboxSource;
  readonly category: ErrorInboxCategory;
  readonly severity: ErrorInboxSeverity;
  readonly projectId: ProjectId | null;
  readonly threadId: ThreadId | null;
  readonly turnId: TurnId | null;
  readonly provider: ProviderKind | null;
  readonly summary: string;
  readonly detail: string | null;
  readonly context: unknown;
};

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripNoise(value: string): string {
  return normalizeWhitespace(value)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\breq(?:uest)?[-:_]?[a-z0-9]+\b/gi, "<request>")
    .replace(/\bturn[-:_]?[a-z0-9]+\b/gi, "<turn>")
    .replace(/\bthread[-:_]?[a-z0-9]+\b/gi, "<thread>")
    .replace(/\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z\b/gi, "<timestamp>")
    .replace(/[a-z]:\\users\\[^\\\s]+\\appdata\\local\\temp\\[^\\\s)]+/gi, "<temp-path>")
    .replace(/\/tmp\/[^\s)]+/gi, "<temp-path>")
    .toLowerCase();
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return stripNoise(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).toSorted();
    return `{${keys.map((key) => `${key}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return stripNoise(String(value));
}

function firstPartyStackFrames(context: unknown): string[] {
  const stack =
    context && typeof context === "object" && "stack" in (context as Record<string, unknown>)
      ? (context as { stack?: unknown }).stack
      : undefined;
  if (typeof stack !== "string") {
    return [];
  }
  return stack
    .split(/\r?\n/)
    .map((line) => stripNoise(line))
    .filter((line) => line.includes("/src/") || line.includes("\\src\\") || line.includes("apps/web"))
    .slice(0, 3);
}

function contextualValue(context: unknown, keys: ReadonlyArray<string>): string | null {
  if (!context || typeof context !== "object") {
    return null;
  }
  const record = context as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return stripNoise(value);
    }
  }
  return null;
}

export function sanitizeContext(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as unknown;
  } catch {
    return {
      value: stripNoise(String(value)),
    };
  }
}

export function summarizeContext(value: unknown, limit = 1200): string | null {
  const serialized = stableSerialize(sanitizeContext(value));
  if (serialized.length === 0) {
    return null;
  }
  return serialized.length > limit ? `${serialized.slice(0, limit - 3)}...` : serialized;
}

export function createErrorInboxFingerprint(input: FingerprintInput): string {
  const context = sanitizeContext(input.context);
  const parts = [
    input.source,
    input.category,
    input.severity,
    stripNoise(input.summary),
    input.detail ? stripNoise(input.detail) : "",
    input.provider ?? "",
    contextualValue(context, ["path", "configPath"]) ?? "",
    contextualValue(context, ["mcpServerName", "name"]) ?? "",
    contextualValue(context, ["method", "errorClass", "class"]) ?? "",
    ...firstPartyStackFrames(context),
  ];

  return createHash("sha1")
    .update(parts.filter((part) => part.length > 0).join("|"))
    .digest("hex");
}
