import type { TaskRuntimeStatus, TaskState } from "~/types";

export interface OrchestrateFilters {
  readonly search: string;
  readonly state: TaskState | "all";
  readonly runtime: TaskRuntimeStatus | "all";
  readonly needsAttention: boolean;
  readonly hasLinkedThread: boolean;
}

export const DEFAULT_ORCHESTRATE_FILTERS: OrchestrateFilters = {
  search: "",
  state: "all",
  runtime: "all",
  needsAttention: false,
  hasLinkedThread: false,
};
