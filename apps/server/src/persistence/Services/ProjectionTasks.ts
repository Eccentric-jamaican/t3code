import {
  ChatAttachment,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  TaskId,
  ThreadId,
} from "@t3tools/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionTaskState = Schema.Literals([
  "backlog",
  "ready",
  "running",
  "review",
  "blocked",
  "done",
]);
export type ProjectionTaskState = typeof ProjectionTaskState.Type;

export const ProjectionTask = Schema.Struct({
  taskId: TaskId,
  projectId: ProjectId,
  title: Schema.String,
  brief: Schema.String,
  acceptanceCriteria: Schema.String,
  attachments: Schema.Array(ChatAttachment),
  state: ProjectionTaskState,
  priority: Schema.NullOr(NonNegativeInt),
  threadId: Schema.NullOr(ThreadId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectionTask = typeof ProjectionTask.Type;

export const GetProjectionTaskInput = Schema.Struct({
  taskId: TaskId,
});
export type GetProjectionTaskInput = typeof GetProjectionTaskInput.Type;

export const DeleteProjectionTaskInput = Schema.Struct({
  taskId: TaskId,
});
export type DeleteProjectionTaskInput = typeof DeleteProjectionTaskInput.Type;

export interface ProjectionTaskRepositoryShape {
  readonly upsert: (row: ProjectionTask) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getById: (
    input: GetProjectionTaskInput,
  ) => Effect.Effect<Option.Option<ProjectionTask>, ProjectionRepositoryError>;
  readonly listAll: () => Effect.Effect<ReadonlyArray<ProjectionTask>, ProjectionRepositoryError>;
  readonly deleteById: (
    input: DeleteProjectionTaskInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionTaskRepository extends ServiceMap.Service<
  ProjectionTaskRepository,
  ProjectionTaskRepositoryShape
>()("t3/persistence/Services/ProjectionTasks/ProjectionTaskRepository") {}
