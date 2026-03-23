import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema, Struct } from "effect";

import { toPersistenceSqlError } from "../../persistence/Errors.ts";
import {
  ErrorInboxRepository,
  type ErrorInboxRepositoryShape,
  GetErrorInboxEntryByFingerprintInput,
  GetErrorInboxEntryByIdInput,
} from "../Services/ErrorInboxRepository.ts";
import { ErrorInboxEntry } from "@t3tools/contracts";

const makeErrorInboxRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const ErrorInboxEntryDbRow = ErrorInboxEntry.mapFields(
    Struct.assign({
      latestContextJson: Schema.fromJsonString(Schema.Unknown),
    }),
  );

  const upsertErrorInboxEntry = SqlSchema.void({
    Request: ErrorInboxEntry,
    execute: (entry) =>
      sql`
        INSERT INTO error_inbox_entries (
          id,
          fingerprint,
          source,
          category,
          severity,
          project_id,
          thread_id,
          turn_id,
          provider,
          summary,
          detail,
          latest_context_json,
          first_seen_at,
          last_seen_at,
          occurrence_count,
          linked_task_id,
          resolution
        )
        VALUES (
          ${entry.id},
          ${entry.fingerprint},
          ${entry.source},
          ${entry.category},
          ${entry.severity},
          ${entry.projectId},
          ${entry.threadId},
          ${entry.turnId},
          ${entry.provider},
          ${entry.summary},
          ${entry.detail},
          ${JSON.stringify(entry.latestContextJson)},
          ${entry.firstSeenAt},
          ${entry.lastSeenAt},
          ${entry.occurrenceCount},
          ${entry.linkedTaskId},
          ${entry.resolution}
        )
        ON CONFLICT (id)
        DO UPDATE SET
          fingerprint = excluded.fingerprint,
          source = excluded.source,
          category = excluded.category,
          severity = excluded.severity,
          project_id = excluded.project_id,
          thread_id = excluded.thread_id,
          turn_id = excluded.turn_id,
          provider = excluded.provider,
          summary = excluded.summary,
          detail = excluded.detail,
          latest_context_json = excluded.latest_context_json,
          first_seen_at = excluded.first_seen_at,
          last_seen_at = excluded.last_seen_at,
          occurrence_count = excluded.occurrence_count,
          linked_task_id = excluded.linked_task_id,
          resolution = excluded.resolution
      `,
  });

  const getErrorInboxEntryById = SqlSchema.findOneOption({
    Request: GetErrorInboxEntryByIdInput,
    Result: ErrorInboxEntryDbRow,
    execute: ({ entryId }) =>
      sql`
        SELECT
          id,
          fingerprint,
          source,
          category,
          severity,
          project_id AS "projectId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          provider,
          summary,
          detail,
          latest_context_json AS "latestContextJson",
          first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt",
          occurrence_count AS "occurrenceCount",
          linked_task_id AS "linkedTaskId",
          resolution
        FROM error_inbox_entries
        WHERE id = ${entryId}
      `,
  });

  const getErrorInboxEntryByFingerprint = SqlSchema.findOneOption({
    Request: GetErrorInboxEntryByFingerprintInput,
    Result: ErrorInboxEntryDbRow,
    execute: ({ fingerprint }) =>
      sql`
        SELECT
          id,
          fingerprint,
          source,
          category,
          severity,
          project_id AS "projectId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          provider,
          summary,
          detail,
          latest_context_json AS "latestContextJson",
          first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt",
          occurrence_count AS "occurrenceCount",
          linked_task_id AS "linkedTaskId",
          resolution
        FROM error_inbox_entries
        WHERE fingerprint = ${fingerprint}
      `,
  });

  const listErrorInboxEntries = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ErrorInboxEntryDbRow,
    execute: () =>
      sql`
        SELECT
          id,
          fingerprint,
          source,
          category,
          severity,
          project_id AS "projectId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          provider,
          summary,
          detail,
          latest_context_json AS "latestContextJson",
          first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt",
          occurrence_count AS "occurrenceCount",
          linked_task_id AS "linkedTaskId",
          resolution
        FROM error_inbox_entries
        ORDER BY last_seen_at DESC, first_seen_at DESC, id ASC
      `,
  });

  const upsert: ErrorInboxRepositoryShape["upsert"] = (entry) =>
    upsertErrorInboxEntry(entry).pipe(
      Effect.mapError(toPersistenceSqlError("ErrorInboxRepository.upsert:query")),
    );

  const getById: ErrorInboxRepositoryShape["getById"] = (input) =>
    getErrorInboxEntryById(input).pipe(
      Effect.mapError(toPersistenceSqlError("ErrorInboxRepository.getById:query")),
    );

  const getByFingerprint: ErrorInboxRepositoryShape["getByFingerprint"] = (input) =>
    getErrorInboxEntryByFingerprint(input).pipe(
      Effect.mapError(toPersistenceSqlError("ErrorInboxRepository.getByFingerprint:query")),
    );

  const listAll: ErrorInboxRepositoryShape["listAll"] = () =>
    listErrorInboxEntries(undefined).pipe(
      Effect.mapError(toPersistenceSqlError("ErrorInboxRepository.listAll:query")),
    );

  return {
    upsert,
    getById,
    getByFingerprint,
    listAll,
  } satisfies ErrorInboxRepositoryShape;
});

export const ErrorInboxRepositoryLive = Layer.effect(ErrorInboxRepository, makeErrorInboxRepository);
