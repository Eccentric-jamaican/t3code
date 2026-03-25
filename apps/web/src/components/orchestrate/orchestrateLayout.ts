import type { TaskState } from "~/types";

export const TASK_STATE_ORDER: readonly TaskState[] = [
  "backlog",
  "ready",
  "running",
  "review",
  "blocked",
  "done",
];

export const DEFAULT_HIDDEN_STATES: readonly TaskState[] = [];

export function visibleTaskStates(hiddenStates: ReadonlySet<TaskState>): TaskState[] {
  return TASK_STATE_ORDER.filter((state) => !hiddenStates.has(state));
}

export function hiddenTaskStates(hiddenStates: ReadonlySet<TaskState>): TaskState[] {
  return TASK_STATE_ORDER.filter((state) => hiddenStates.has(state));
}
