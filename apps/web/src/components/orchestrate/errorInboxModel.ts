import type { ErrorInboxEntry, Project, Task, Thread } from "~/types";

export interface ErrorInboxListEntry {
  readonly entry: ErrorInboxEntry;
  readonly project: Project | null;
  readonly linkedTask: Task | null;
  readonly thread: Thread | null;
}

export function buildErrorInboxCollection(input: {
  readonly entries: readonly ErrorInboxEntry[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly threads: readonly Thread[];
}): ErrorInboxListEntry[] {
  const projectsById = new Map(input.projects.map((project) => [project.id, project] as const));
  const tasksById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const threadsById = new Map(input.threads.map((thread) => [thread.id, thread] as const));

  return input.entries.map((entry) => ({
    entry,
    project: entry.projectId ? (projectsById.get(entry.projectId) ?? null) : null,
    linkedTask: entry.linkedTaskId ? (tasksById.get(entry.linkedTaskId) ?? null) : null,
    thread: entry.threadId ? (threadsById.get(entry.threadId) ?? null) : null,
  }));
}

export function filterErrorInboxCollection(
  entries: readonly ErrorInboxListEntry[],
  input: {
    readonly selectedProjectId: string | null;
    readonly search: string;
    readonly includeResolved: boolean;
  },
): ErrorInboxListEntry[] {
  const normalizedSearch = input.search.trim().toLowerCase();
  return entries.filter(({ entry }) => {
    if (!input.includeResolved && entry.resolution !== null) {
      return false;
    }
    if (
      input.selectedProjectId !== null &&
      entry.projectId !== null &&
      entry.projectId !== input.selectedProjectId
    ) {
      return false;
    }
    if (normalizedSearch.length === 0) {
      return true;
    }
    return (
      entry.summary.toLowerCase().includes(normalizedSearch) ||
      entry.source.toLowerCase().includes(normalizedSearch) ||
      entry.category.toLowerCase().includes(normalizedSearch) ||
      (entry.detail?.toLowerCase().includes(normalizedSearch) ?? false)
    );
  });
}

export function sortErrorInboxCollection(
  entries: readonly ErrorInboxListEntry[],
): ErrorInboxListEntry[] {
  return entries.toSorted((left, right) => {
    if (left.entry.lastSeenAt !== right.entry.lastSeenAt) {
      return right.entry.lastSeenAt.localeCompare(left.entry.lastSeenAt);
    }
    return right.entry.occurrenceCount - left.entry.occurrenceCount;
  });
}

export function relativeErrorTimeLabel(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return iso;
  }
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
