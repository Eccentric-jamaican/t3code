import { Schema } from "effect";

import { ErrorInboxEntryId } from "@t3tools/contracts";

export class ErrorInboxEntryNotFoundError extends Schema.TaggedErrorClass<ErrorInboxEntryNotFoundError>()(
  "ErrorInboxEntryNotFoundError",
  {
    entryId: ErrorInboxEntryId,
  },
) {
  override get message(): string {
    return `Error inbox entry '${this.entryId}' was not found.`;
  }
}

export class ErrorInboxProjectResolutionError extends Schema.TaggedErrorClass<ErrorInboxProjectResolutionError>()(
  "ErrorInboxProjectResolutionError",
  {
    entryId: ErrorInboxEntryId,
  },
) {
  override get message(): string {
    return `Error inbox entry '${this.entryId}' could not be matched to a project.`;
  }
}
