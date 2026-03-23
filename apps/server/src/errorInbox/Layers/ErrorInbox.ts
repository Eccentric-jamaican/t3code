import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

import {
  CommandId,
  ErrorInboxEntry,
  ErrorInboxEntryId,
  type ThreadId,
  TaskId,
} from "@t3tools/contracts";
import { Data, Effect, Layer, Option, Path, PubSub, Stream } from "effect";

import { ServerConfig } from "../../config.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ErrorInboxEntryNotFoundError, ErrorInboxProjectResolutionError } from "../Errors.ts";
import { createErrorInboxFingerprint, sanitizeContext, summarizeContext } from "../fingerprint.ts";
import { ErrorInboxRepository } from "../Services/ErrorInboxRepository.ts";
import { ErrorInboxService, type ErrorInboxServiceShape } from "../Services/ErrorInbox.ts";

const serverCommandId = (tag: string): CommandId =>
  CommandId.makeUnsafe(`server:error-inbox:${tag}:${randomUUID()}`);

function entryIdForFingerprint(fingerprint: string): ErrorInboxEntryId {
  return ErrorInboxEntryId.makeUnsafe(`err-${fingerprint}`);
}

function truncateText(value: string | null | undefined, limit = 800): string | null {
  if (!value) {
    return null;
  }
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function buildPromotionBrief(entry: ErrorInboxEntry): string {
  const contextSummary = summarizeContext(entry.latestContextJson, 1200);
  const lines = [
    "Fix the captured local error inbox entry.",
    "",
    `Source: ${entry.source}`,
    `Category: ${entry.category}`,
    `Severity: ${entry.severity}`,
    `First seen: ${entry.firstSeenAt}`,
    `Last seen: ${entry.lastSeenAt}`,
    `Occurrences: ${entry.occurrenceCount}`,
    entry.threadId ? `Thread: ${entry.threadId}` : null,
    entry.turnId ? `Turn: ${entry.turnId}` : null,
    entry.provider ? `Provider: ${entry.provider}` : null,
    "",
    `Summary: ${entry.summary}`,
    entry.detail ? "" : null,
    entry.detail ? `Detail: ${entry.detail}` : null,
    contextSummary ? "" : null,
    contextSummary ? "Context excerpt:" : null,
    contextSummary ? "```json" : null,
    contextSummary,
    contextSummary ? "```" : null,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

const DEFAULT_ACCEPTANCE_CRITERIA = [
  "root cause identified and fixed",
  "original error no longer reproduces",
  "related handling/logging updated if needed",
  "bun lint passes",
  "bun typecheck passes",
].join("\n");

class ErrorInboxLogDirectoryError extends Data.TaggedError("ErrorInboxLogDirectoryError")<{
  readonly path: string;
  readonly cause?: unknown;
}> {}

class ErrorInboxOccurrenceWriteError extends Data.TaggedError("ErrorInboxOccurrenceWriteError")<{
  readonly path: string;
  readonly cause?: unknown;
}> {}

const make = Effect.gen(function* () {
  const repository = yield* ErrorInboxRepository;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const path = yield* Path.Path;
  const serverConfig = yield* ServerConfig;
  const updatesPubSub = yield* PubSub.unbounded<{
    reason: "upsert" | "resolutionChanged" | "linkedTask";
    entry: ErrorInboxEntry;
  }>();

  const logPath = path.join(serverConfig.stateDir, "logs", "error-inbox.ndjson");

  const ensureLogDirectory = Effect.tryPromise({
    try: () => fs.mkdir(path.dirname(logPath), { recursive: true }),
    catch: (cause) =>
      new ErrorInboxLogDirectoryError({
        path: path.dirname(logPath),
        cause,
      }),
  }).pipe(Effect.ignore);

  const resolveProjectIdForThread = (threadId: ThreadId | null | undefined) =>
    Effect.gen(function* () {
      if (!threadId) {
        return null;
      }
      const readModel = yield* orchestrationEngine.getReadModel();
      const thread = readModel.threads.find((entry) => entry.id === threadId && entry.deletedAt === null);
      return thread?.projectId ?? null;
    });

  const writeOccurrenceLog = (entry: ErrorInboxEntry) =>
    Effect.gen(function* () {
      yield* ensureLogDirectory;
      yield* Effect.tryPromise({
        try: () =>
          fs.appendFile(
            logPath,
            `${JSON.stringify({
              entryId: entry.id,
              fingerprint: entry.fingerprint,
              source: entry.source,
              category: entry.category,
              severity: entry.severity,
              projectId: entry.projectId,
              threadId: entry.threadId,
              turnId: entry.turnId,
              provider: entry.provider,
              summary: entry.summary,
              detail: entry.detail,
              context: entry.latestContextJson,
              occurredAt: entry.lastSeenAt,
            })}\n`,
            "utf8",
          ),
        catch: (cause) =>
          new ErrorInboxOccurrenceWriteError({
            path: logPath,
            cause,
          }),
      }).pipe(Effect.ignore);
    }).pipe(Effect.asVoid);

  const publishUpdate = (
    reason: "upsert" | "resolutionChanged" | "linkedTask",
    entry: ErrorInboxEntry,
  ) => PubSub.publish(updatesPubSub, { reason, entry }).pipe(Effect.asVoid);

  const loadEntry = (entryId: ErrorInboxEntryId) =>
    repository.getById({ entryId }).pipe(
      Effect.flatMap((result) =>
        Option.match(result, {
          onNone: () => Effect.fail(new ErrorInboxEntryNotFoundError({ entryId })),
          onSome: Effect.succeed,
        }),
      ),
    );

  const listEntries: ErrorInboxServiceShape["listEntries"] = () => repository.listAll();

  const capture: ErrorInboxServiceShape["capture"] = (input) =>
    Effect.gen(function* () {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const latestContextJson = sanitizeContext(input.context ?? {});
      const resolvedProjectId =
        input.projectId !== undefined && input.projectId !== null
          ? input.projectId
          : yield* resolveProjectIdForThread(input.threadId ?? null);
      const fingerprint = createErrorInboxFingerprint({
        source: input.source,
        category: input.category,
        severity: input.severity,
        projectId: resolvedProjectId ?? null,
        threadId: input.threadId ?? null,
        turnId: input.turnId ?? null,
        provider: input.provider ?? null,
        summary: input.summary,
        detail: input.detail ?? null,
        context: latestContextJson,
      });

      const existing = yield* repository.getByFingerprint({ fingerprint }).pipe(
        Effect.map((result) => Option.getOrNull(result)),
      );

      const entry: ErrorInboxEntry = existing
        ? {
            ...existing,
            source: input.source,
            category: input.category,
            severity: input.severity,
            projectId: resolvedProjectId ?? existing.projectId,
            threadId: input.threadId ?? existing.threadId,
            turnId: input.turnId ?? existing.turnId,
            provider: input.provider ?? existing.provider,
            summary: input.summary,
            detail: truncateText(input.detail ?? existing.detail),
            latestContextJson,
            lastSeenAt: occurredAt,
            occurrenceCount: existing.occurrenceCount + 1,
          }
        : {
            id: entryIdForFingerprint(fingerprint),
            fingerprint,
            source: input.source,
            category: input.category,
            severity: input.severity,
            projectId: resolvedProjectId ?? null,
            threadId: input.threadId ?? null,
            turnId: input.turnId ?? null,
            provider: input.provider ?? null,
            summary: input.summary,
            detail: truncateText(input.detail ?? null),
            latestContextJson,
            firstSeenAt: occurredAt,
            lastSeenAt: occurredAt,
            occurrenceCount: 1,
            linkedTaskId: null,
            resolution: null,
          };

      yield* repository.upsert(entry);
      yield* writeOccurrenceLog(entry);
      yield* publishUpdate("upsert", entry);
      return entry;
    });

  const setResolution: ErrorInboxServiceShape["setResolution"] = (entryId, resolution) =>
    Effect.gen(function* () {
      const entry = yield* loadEntry(entryId);
      const updated: ErrorInboxEntry = {
        ...entry,
        resolution,
      };
      yield* repository.upsert(updated);
      yield* publishUpdate("resolutionChanged", updated);
      return updated;
    });

  const promoteToTask: ErrorInboxServiceShape["promoteToTask"] = (input) =>
    Effect.gen(function* () {
      const entry = yield* loadEntry(input.entryId);
      if (entry.linkedTaskId) {
        return {
          entry,
          taskId: entry.linkedTaskId,
        };
      }

      const projectId = entry.projectId ?? input.projectId ?? null;
      if (!projectId) {
        return yield* new ErrorInboxProjectResolutionError({ entryId: input.entryId });
      }

      const taskId = TaskId.makeUnsafe(randomUUID());
      const createdAt = new Date().toISOString();
      yield* orchestrationEngine.dispatch({
        type: "task.create",
        commandId: serverCommandId("promote-to-task"),
        taskId,
        projectId,
        title: `[Error] ${entry.summary}`,
        brief: buildPromotionBrief(entry),
        acceptanceCriteria: DEFAULT_ACCEPTANCE_CRITERIA,
        state: "backlog",
        createdAt,
      });

      const updated: ErrorInboxEntry = {
        ...entry,
        projectId,
        linkedTaskId: taskId,
      };
      yield* repository.upsert(updated);
      yield* publishUpdate("linkedTask", updated);
      return {
        entry: updated,
        taskId,
      };
    });

  return {
    listEntries,
    capture,
    setResolution,
    promoteToTask,
    updates: Stream.fromPubSub(updatesPubSub),
  } satisfies ErrorInboxServiceShape;
});

export const ErrorInboxServiceLive = Layer.effect(ErrorInboxService, make);

export const ErrorInboxServiceNoop = Layer.succeed(ErrorInboxService, {
  listEntries: () => Effect.succeed([]),
  capture: (input) =>
    Effect.succeed({
      id: ErrorInboxEntryId.makeUnsafe("err-noop"),
      fingerprint: "noop",
      source: input.source,
      category: input.category,
      severity: input.severity,
      projectId: input.projectId ?? null,
      threadId: input.threadId ?? null,
      turnId: input.turnId ?? null,
      provider: input.provider ?? null,
      summary: input.summary,
      detail: input.detail ?? null,
      latestContextJson: sanitizeContext(input.context ?? {}),
      firstSeenAt: input.occurredAt ?? new Date().toISOString(),
      lastSeenAt: input.occurredAt ?? new Date().toISOString(),
      occurrenceCount: 1,
      linkedTaskId: null,
      resolution: null,
    } satisfies ErrorInboxEntry),
  setResolution: (entryId, resolution) =>
    Effect.succeed({
      id: entryId,
      fingerprint: "noop",
      source: "server-internal",
      category: "orchestration",
      severity: "error",
      projectId: null,
      threadId: null,
      turnId: null,
      provider: null,
      summary: "noop",
      detail: null,
      latestContextJson: {},
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      occurrenceCount: 1,
      linkedTaskId: null,
      resolution,
    } satisfies ErrorInboxEntry),
  promoteToTask: (input) =>
    Effect.succeed({
      entry: {
        id: input.entryId,
        fingerprint: "noop",
        source: "server-internal",
        category: "orchestration",
        severity: "error",
        projectId: input.projectId ?? null,
        threadId: null,
        turnId: null,
        provider: null,
        summary: "noop",
        detail: null,
        latestContextJson: {},
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        occurrenceCount: 1,
        linkedTaskId: TaskId.makeUnsafe("task-noop"),
        resolution: null,
      } satisfies ErrorInboxEntry,
      taskId: TaskId.makeUnsafe("task-noop"),
    }),
  updates: Stream.empty,
} satisfies ErrorInboxServiceShape);
