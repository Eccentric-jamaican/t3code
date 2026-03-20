import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema, Struct } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionTaskInput,
  GetProjectionTaskInput,
  ProjectionTask,
  ProjectionTaskRepository,
  type ProjectionTaskRepositoryShape,
} from "../Services/ProjectionTasks.ts";

const makeProjectionTaskRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const ProjectionTaskDbRowSchema = ProjectionTask.mapFields(
    Struct.assign({
      attachments: Schema.fromJsonString(ProjectionTask.fields.attachments),
    }),
  );

  const upsertProjectionTaskRow = SqlSchema.void({
    Request: ProjectionTask,
    execute: (row) =>
      sql`
        INSERT INTO projection_tasks (
          task_id,
          project_id,
          title,
          brief,
          acceptance_criteria,
          attachments,
          state,
          priority,
          thread_id,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          ${row.taskId},
          ${row.projectId},
          ${row.title},
          ${row.brief},
          ${row.acceptanceCriteria},
          ${JSON.stringify(row.attachments)},
          ${row.state},
          ${row.priority},
          ${row.threadId},
          ${row.createdAt},
          ${row.updatedAt},
          ${row.deletedAt}
        )
        ON CONFLICT (task_id)
        DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          brief = excluded.brief,
          acceptance_criteria = excluded.acceptance_criteria,
          attachments = excluded.attachments,
          state = excluded.state,
          priority = excluded.priority,
          thread_id = excluded.thread_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
      `,
  });

  const getProjectionTaskRow = SqlSchema.findOneOption({
    Request: GetProjectionTaskInput,
    Result: ProjectionTaskDbRowSchema,
    execute: ({ taskId }) =>
      sql`
        SELECT
          task_id AS "taskId",
          project_id AS "projectId",
          title,
          brief,
          acceptance_criteria AS "acceptanceCriteria",
          attachments AS "attachments",
          state,
          priority,
          thread_id AS "threadId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_tasks
        WHERE task_id = ${taskId}
      `,
  });

  const listProjectionTaskRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionTaskDbRowSchema,
    execute: () =>
      sql`
        SELECT
          task_id AS "taskId",
          project_id AS "projectId",
          title,
          brief,
          acceptance_criteria AS "acceptanceCriteria",
          attachments AS "attachments",
          state,
          priority,
          thread_id AS "threadId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_tasks
        ORDER BY created_at ASC, task_id ASC
      `,
  });

  const deleteProjectionTaskRow = SqlSchema.void({
    Request: DeleteProjectionTaskInput,
    execute: ({ taskId }) =>
      sql`
        DELETE FROM projection_tasks
        WHERE task_id = ${taskId}
      `,
  });

  const upsert: ProjectionTaskRepositoryShape["upsert"] = (row) =>
    upsertProjectionTaskRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.upsert:query")),
    );

  const getById: ProjectionTaskRepositoryShape["getById"] = (input) =>
    getProjectionTaskRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.getById:query")),
    );

  const listAll: ProjectionTaskRepositoryShape["listAll"] = () =>
    listProjectionTaskRows(undefined).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.listAll:query")),
    );

  const deleteById: ProjectionTaskRepositoryShape["deleteById"] = (input) =>
    deleteProjectionTaskRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.deleteById:query")),
    );

  return {
    upsert,
    getById,
    listAll,
    deleteById,
  } satisfies ProjectionTaskRepositoryShape;
});

export const ProjectionTaskRepositoryLive = Layer.effect(
  ProjectionTaskRepository,
  makeProjectionTaskRepository,
);
