import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installWindow(href: string) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href,
      },
    },
  });
}

describe("errorInboxReporter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, "window");
    vi.restoreAllMocks();
  });

  it("enriches diagnostics with route context and suppresses duplicates for five seconds", async () => {
    installWindow("http://localhost/thread-1?projectId=project-1");

    const { useStore } = await import("./store");
    const { reportClientDiagnostic, setClientDiagnosticReporter, setClientDiagnosticRoute } =
      await import("./errorInboxReporter");

    useStore.setState({
      projects: [
        {
          id: ProjectId.makeUnsafe("project-1"),
          name: "Project",
          cwd: "/tmp/project",
          model: "gpt-5-codex",
          expanded: true,
          scripts: [],
        },
      ],
      threads: [
        {
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
        },
      ],
      tasks: [],
      taskRuntimes: [],
      projectRules: [],
      errorInbox: [],
      threadsHydrated: true,
    });

    const reporter = vi.fn<(...args: Array<unknown>) => Promise<unknown>>().mockResolvedValue(
      undefined,
    );
    setClientDiagnosticRoute("/thread-1");
    setClientDiagnosticReporter(reporter);

    reportClientDiagnostic({
      source: "browser-runtime",
      category: "browser",
      severity: "error",
      summary: "Unhandled runtime error",
      detail: "Cannot read properties of undefined",
      context: {
        stack: "Error\n at render (apps/web/src/routes/__root.tsx:1:1)",
      },
    });

    reportClientDiagnostic({
      source: "browser-runtime",
      category: "browser",
      severity: "error",
      summary: "Unhandled runtime error",
      detail: "Cannot read properties of undefined",
      context: {
        stack: "Error\n at render (apps/web/src/routes/__root.tsx:1:1)",
      },
    });

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: ProjectId.makeUnsafe("project-1"),
        threadId: ThreadId.makeUnsafe("thread-1"),
        context: expect.objectContaining({
          route: "/thread-1",
        }),
      }),
    );

    vi.advanceTimersByTime(5_001);

    reportClientDiagnostic({
      source: "browser-runtime",
      category: "browser",
      severity: "error",
      summary: "Unhandled runtime error",
      detail: "Cannot read properties of undefined",
      context: {
        stack: "Error\n at render (apps/web/src/routes/__root.tsx:1:1)",
      },
    });

    expect(reporter).toHaveBeenCalledTimes(2);
  });
});
