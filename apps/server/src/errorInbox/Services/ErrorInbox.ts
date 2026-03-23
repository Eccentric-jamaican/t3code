import {
  ErrorInboxEntry,
  ErrorInboxEntryId,
  ErrorInboxCategory,
  type ErrorInboxCategory as ErrorInboxCategoryType,
  type ErrorInboxResolution as ErrorInboxResolutionType,
  ErrorInboxSeverity,
  type ErrorInboxSeverity as ErrorInboxSeverityType,
  ErrorInboxSource,
  type ErrorInboxSource as ErrorInboxSourceType,
  type ProviderKind,
  ProviderKind as ProviderKindSchema,
  ProjectId,
  ServerErrorInboxUpdatedPayload,
  TaskId,
  ThreadId,
  TurnId,
  type ServerPromoteErrorInboxEntryToTaskInput,
} from "@t3tools/contracts";
import { Schema, ServiceMap, Stream } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { ErrorInboxEntryNotFoundError, ErrorInboxProjectResolutionError } from "../Errors.ts";
import type { OrchestrationDispatchError } from "../../orchestration/Errors.ts";

export const ErrorInboxCaptureInput = Schema.Struct({
  source: ErrorInboxSource,
  category: ErrorInboxCategory,
  severity: ErrorInboxSeverity,
  summary: ErrorInboxEntry.fields.summary,
  detail: Schema.optional(Schema.NullOr(Schema.String)),
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  threadId: Schema.optional(Schema.NullOr(ThreadId)),
  turnId: Schema.optional(Schema.NullOr(TurnId)),
  provider: Schema.optional(Schema.NullOr(ProviderKindSchema)),
  context: Schema.optional(Schema.Unknown),
  occurredAt: Schema.optional(ErrorInboxEntry.fields.lastSeenAt),
});
export type ErrorInboxCaptureInput = {
  readonly source: ErrorInboxSourceType;
  readonly category: ErrorInboxCategoryType;
  readonly severity: ErrorInboxSeverityType;
  readonly summary: string;
  readonly detail?: string | null;
  readonly projectId?: ProjectId | null;
  readonly threadId?: ThreadId | null;
  readonly turnId?: TurnId | null;
  readonly provider?: ProviderKind | null;
  readonly context?: unknown;
  readonly occurredAt?: string;
};

export interface ErrorInboxServiceShape {
  readonly listEntries: () => Effect.Effect<ReadonlyArray<ErrorInboxEntry>, ProjectionRepositoryError>;
  readonly capture: (
    input: ErrorInboxCaptureInput,
  ) => Effect.Effect<ErrorInboxEntry, ProjectionRepositoryError>;
  readonly setResolution: (
    entryId: ErrorInboxEntryId,
    resolution: ErrorInboxResolutionType | null,
  ) => Effect.Effect<
    ErrorInboxEntry,
    ProjectionRepositoryError | ErrorInboxEntryNotFoundError
  >;
  readonly promoteToTask: (
    input: ServerPromoteErrorInboxEntryToTaskInput,
  ) => Effect.Effect<
    { readonly entry: ErrorInboxEntry; readonly taskId: TaskId },
    | ProjectionRepositoryError
    | ErrorInboxEntryNotFoundError
    | ErrorInboxProjectResolutionError
    | OrchestrationDispatchError
  >;
  readonly updates: Stream.Stream<ServerErrorInboxUpdatedPayload, never>;
}

export class ErrorInboxService extends ServiceMap.Service<ErrorInboxService, ErrorInboxServiceShape>()(
  "t3/errorInbox/Services/ErrorInbox/ErrorInboxService",
) {}
