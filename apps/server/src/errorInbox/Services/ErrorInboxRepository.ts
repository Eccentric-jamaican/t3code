import { ErrorInboxEntry, ErrorInboxEntryId, ErrorInboxFingerprint } from "@t3tools/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const GetErrorInboxEntryByIdInput = Schema.Struct({
  entryId: ErrorInboxEntryId,
});
export type GetErrorInboxEntryByIdInput = typeof GetErrorInboxEntryByIdInput.Type;

export const GetErrorInboxEntryByFingerprintInput = Schema.Struct({
  fingerprint: ErrorInboxFingerprint,
});
export type GetErrorInboxEntryByFingerprintInput = typeof GetErrorInboxEntryByFingerprintInput.Type;

export interface ErrorInboxRepositoryShape {
  readonly upsert: (entry: ErrorInboxEntry) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getById: (
    input: GetErrorInboxEntryByIdInput,
  ) => Effect.Effect<Option.Option<ErrorInboxEntry>, ProjectionRepositoryError>;
  readonly getByFingerprint: (
    input: GetErrorInboxEntryByFingerprintInput,
  ) => Effect.Effect<Option.Option<ErrorInboxEntry>, ProjectionRepositoryError>;
  readonly listAll: () => Effect.Effect<ReadonlyArray<ErrorInboxEntry>, ProjectionRepositoryError>;
}

export class ErrorInboxRepository extends ServiceMap.Service<
  ErrorInboxRepository,
  ErrorInboxRepositoryShape
>()("t3/errorInbox/Services/ErrorInboxRepository") {}
