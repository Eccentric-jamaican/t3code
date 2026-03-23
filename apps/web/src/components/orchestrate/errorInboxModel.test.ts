import { ProjectId, TaskId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ErrorInboxEntry, Project, Task, Thread } from "~/types";
import {
  buildErrorInboxCollection,
  filterErrorInboxCollection,
  relativeErrorTimeLabel,
  sortErrorInboxCollection,
} from "./errorInboxModel";

function makeProject(): Project {
  return {
    id: ProjectId.makeUnsafe("project-1"),
    name: "Project",
    cwd: "/tmp/project",
    model: "gpt-5-codex",
    expanded: true,
    scripts: [],
  };
}

function makeThread(): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    origin: "user",
    taskId: null,
    title: "Thread",
    model: "gpt-5-codex",
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-22T19:00:00.000Z",
    updatedAt: "2026-03-22T19:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    isPinned: false,
    turnDiffSummaries: [],
    activities: [],
  };
}

function makeTask(): Task {
  return {
    id: TaskId.makeUnsafe("task-1"),
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Fix MCP auth",
    brief: "Brief",
    acceptanceCriteria: "Criteria",
    attachments: [],
    state: "backlog",
    priority: null,
    threadId: ThreadId.makeUnsafe("thread-1"),
    createdAt: "2026-03-22T19:00:00.000Z",
    updatedAt: "2026-03-22T19:00:00.000Z",
  };
}

function makeEntry(overrides: Partial<ErrorInboxEntry> = {}): ErrorInboxEntry {
  return {
    id: "err-1",
    fingerprint: "fingerprint-1",
    source: "provider-runtime",
    category: "provider",
    severity: "error",
    projectId: ProjectId.makeUnsafe("project-1"),
    threadId: ThreadId.makeUnsafe("thread-1"),
    turnId: null,
    provider: "codex",
    summary: "Provider runtime error",
    detail: "spawn failed",
    latestContextJson: {
      method: "process/error",
    },
    firstSeenAt: "2026-03-22T19:00:00.000Z",
    lastSeenAt: "2026-03-22T19:05:00.000Z",
    occurrenceCount: 2,
    linkedTaskId: TaskId.makeUnsafe("task-1"),
    resolution: null,
    ...overrides,
  };
}

describe("errorInboxModel", () => {
  it("joins linked project, task, and thread references", () => {
    const collection = buildErrorInboxCollection({
      entries: [makeEntry()],
      projects: [makeProject()],
      tasks: [makeTask()],
      threads: [makeThread()],
    });

    expect(collection[0]?.project?.name).toBe("Project");
    expect(collection[0]?.linkedTask?.title).toBe("Fix MCP auth");
    expect(collection[0]?.thread?.title).toBe("Thread");
  });

  it("filters resolved entries while keeping global entries visible in a project scope", () => {
    const collection = buildErrorInboxCollection({
      entries: [
        makeEntry(),
        makeEntry({
          id: "err-2",
          fingerprint: "fingerprint-2",
          projectId: null,
          threadId: null,
          linkedTaskId: null,
          summary: "Global websocket warning",
          category: "websocket",
          source: "websocket",
          severity: "warning",
          lastSeenAt: "2026-03-22T19:06:00.000Z",
        }),
        makeEntry({
          id: "err-3",
          fingerprint: "fingerprint-3",
          resolution: "resolved",
          summary: "Resolved provider warning",
          lastSeenAt: "2026-03-22T19:07:00.000Z",
        }),
      ],
      projects: [makeProject()],
      tasks: [makeTask()],
      threads: [makeThread()],
    });

    const filtered = filterErrorInboxCollection(collection, {
      selectedProjectId: ProjectId.makeUnsafe("project-1"),
      search: "warning",
      includeResolved: false,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.entry.summary).toBe("Global websocket warning");
  });

  it("sorts by most recent occurrence and formats relative timestamps", () => {
    const now = new Date("2026-03-22T20:00:00.000Z").valueOf();
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    const sorted = sortErrorInboxCollection([
      {
        entry: makeEntry({
          id: "err-older",
          fingerprint: "older",
          lastSeenAt: "2026-03-22T18:00:00.000Z",
          occurrenceCount: 10,
        }),
        project: null,
        linkedTask: null,
        thread: null,
      },
      {
        entry: makeEntry({
          id: "err-newer",
          fingerprint: "newer",
          lastSeenAt: "2026-03-22T19:30:00.000Z",
          occurrenceCount: 1,
        }),
        project: null,
        linkedTask: null,
        thread: null,
      },
    ]);

    expect(sorted[0]?.entry.id).toBe("err-newer");
    expect(relativeErrorTimeLabel("2026-03-22T19:30:00.000Z")).toBe("30m ago");

    dateNowSpy.mockRestore();
  });
});
