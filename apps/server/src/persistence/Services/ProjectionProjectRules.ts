import { IsoDateTime, ProjectId, RuntimeMode } from "@t3tools/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionProjectRulesState = Schema.Literals([
  "backlog",
  "ready",
  "running",
  "review",
  "blocked",
  "done",
]);

export const ProjectionProjectRules = Schema.Struct({
  projectId: ProjectId,
  promptTemplate: Schema.String,
  defaultModel: Schema.NullOr(Schema.String),
  defaultRuntimeMode: RuntimeMode,
  onSuccessMoveTo: ProjectionProjectRulesState,
  onFailureMoveTo: ProjectionProjectRulesState,
  updatedAt: IsoDateTime,
});
export type ProjectionProjectRules = typeof ProjectionProjectRules.Type;

export const GetProjectionProjectRulesInput = Schema.Struct({
  projectId: ProjectId,
});
export type GetProjectionProjectRulesInput = typeof GetProjectionProjectRulesInput.Type;

export interface ProjectionProjectRulesRepositoryShape {
  readonly upsert: (
    row: ProjectionProjectRules,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getByProjectId: (
    input: GetProjectionProjectRulesInput,
  ) => Effect.Effect<Option.Option<ProjectionProjectRules>, ProjectionRepositoryError>;
  readonly listAll: () => Effect.Effect<
    ReadonlyArray<ProjectionProjectRules>,
    ProjectionRepositoryError
  >;
}

export class ProjectionProjectRulesRepository extends ServiceMap.Service<
  ProjectionProjectRulesRepository,
  ProjectionProjectRulesRepositoryShape
>()("t3/persistence/Services/ProjectionProjectRules/ProjectionProjectRulesRepository") {}
