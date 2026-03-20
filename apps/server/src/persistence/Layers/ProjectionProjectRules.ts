import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  GetProjectionProjectRulesInput,
  ProjectionProjectRules,
  ProjectionProjectRulesRepository,
  type ProjectionProjectRulesRepositoryShape,
} from "../Services/ProjectionProjectRules.ts";

const makeProjectionProjectRulesRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertProjectionProjectRulesRow = SqlSchema.void({
    Request: ProjectionProjectRules,
    execute: (row) =>
      sql`
        INSERT INTO projection_project_rules (
          project_id,
          prompt_template,
          default_model,
          default_runtime_mode,
          on_success_move_to,
          on_failure_move_to,
          updated_at
        )
        VALUES (
          ${row.projectId},
          ${row.promptTemplate},
          ${row.defaultModel},
          ${row.defaultRuntimeMode},
          ${row.onSuccessMoveTo},
          ${row.onFailureMoveTo},
          ${row.updatedAt}
        )
        ON CONFLICT (project_id)
        DO UPDATE SET
          prompt_template = excluded.prompt_template,
          default_model = excluded.default_model,
          default_runtime_mode = excluded.default_runtime_mode,
          on_success_move_to = excluded.on_success_move_to,
          on_failure_move_to = excluded.on_failure_move_to,
          updated_at = excluded.updated_at
      `,
  });

  const getProjectionProjectRulesRow = SqlSchema.findOneOption({
    Request: GetProjectionProjectRulesInput,
    Result: ProjectionProjectRules,
    execute: ({ projectId }) =>
      sql`
        SELECT
          project_id AS "projectId",
          prompt_template AS "promptTemplate",
          default_model AS "defaultModel",
          default_runtime_mode AS "defaultRuntimeMode",
          on_success_move_to AS "onSuccessMoveTo",
          on_failure_move_to AS "onFailureMoveTo",
          updated_at AS "updatedAt"
        FROM projection_project_rules
        WHERE project_id = ${projectId}
      `,
  });

  const listProjectionProjectRulesRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionProjectRules,
    execute: () =>
      sql`
        SELECT
          project_id AS "projectId",
          prompt_template AS "promptTemplate",
          default_model AS "defaultModel",
          default_runtime_mode AS "defaultRuntimeMode",
          on_success_move_to AS "onSuccessMoveTo",
          on_failure_move_to AS "onFailureMoveTo",
          updated_at AS "updatedAt"
        FROM projection_project_rules
        ORDER BY project_id ASC
      `,
  });

  const upsert: ProjectionProjectRulesRepositoryShape["upsert"] = (row) =>
    upsertProjectionProjectRulesRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionProjectRulesRepository.upsert:query")),
    );

  const getByProjectId: ProjectionProjectRulesRepositoryShape["getByProjectId"] = (input) =>
    getProjectionProjectRulesRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionProjectRulesRepository.getByProjectId:query"),
      ),
    );

  const listAll: ProjectionProjectRulesRepositoryShape["listAll"] = () =>
    listProjectionProjectRulesRows(undefined).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionProjectRulesRepository.listAll:query")),
    );

  return {
    upsert,
    getByProjectId,
    listAll,
  } satisfies ProjectionProjectRulesRepositoryShape;
});

export const ProjectionProjectRulesRepositoryLive = Layer.effect(
  ProjectionProjectRulesRepository,
  makeProjectionProjectRulesRepository,
);
