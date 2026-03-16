import "../index.css";

import {
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  type ClientOrchestrationCommand,
  type DesktopBridge,
  type OrchestrationReadModel,
  type ProjectId,
  type ServerConfig,
  type ThreadId,
  TurnId,
  type WsWelcomePayload,
  WS_CHANNELS,
  WS_METHODS,
} from "@t3tools/contracts";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { HttpResponse, http, ws } from "msw";
import { setupWorker } from "msw/browser";
import { page } from "vitest/browser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { getRouter } from "../router";
import { useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";
import { showContextMenuFallback } from "../contextMenuFallback";

const PROJECT_ID = "project-sidebar-browser" as ProjectId;
const THREAD_ID = "thread-sidebar-browser" as ThreadId;
const TURN_ID = TurnId.makeUnsafe("turn-sidebar-browser");
const NOW_ISO = "2026-03-04T12:00:00.000Z";

interface WsRequestEnvelope {
  id: string;
  body: {
    _tag: string;
    [key: string]: unknown;
  };
}

interface TestFixture {
  snapshot: OrchestrationReadModel;
  serverConfig: ServerConfig;
  welcome: WsWelcomePayload;
}

let fixture: TestFixture;
let nextSequence = 1;
const wsLink = ws.link(/ws(s)?:\/\/.*/);

function createFixture(): TestFixture {
  return {
    snapshot: {
      snapshotSequence: 1,
      projects: [
        {
          id: PROJECT_ID,
          title: "t3code-main",
          workspaceRoot: "C:\\Users\\Addis\\source\\repos\\t3code-main",
          defaultModel: "gpt-5",
          scripts: [],
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
          deletedAt: null,
        },
      ],
      threads: [
        {
          id: THREAD_ID,
          projectId: PROJECT_ID,
          title: "Settings popover backend wiring",
          model: "gpt-5",
          interactionMode: "default",
          runtimeMode: "full-access",
          branch: "main",
          worktreePath: null,
          isPinned: false,
          latestTurn: {
            turnId: TURN_ID,
            state: "running",
            interactionMode: "default",
            requestedAt: NOW_ISO,
            startedAt: NOW_ISO,
            completedAt: null,
            assistantMessageId: null,
          },
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
          deletedAt: null,
          messages: [],
          activities: [],
          proposedPlans: [],
          checkpoints: [],
          session: {
            threadId: THREAD_ID,
            status: "running",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: TURN_ID,
            lastError: null,
            updatedAt: NOW_ISO,
          },
        },
      ],
      updatedAt: NOW_ISO,
    },
    serverConfig: {
      cwd: "C:\\Users\\Addis\\source\\repos\\t3code-main",
      keybindingsConfigPath: "C:\\Users\\Addis\\.t3\\userdata\\keybindings.json",
      keybindings: [],
      issues: [],
      providers: [
        {
          provider: "codex",
          status: "ready",
          available: true,
          authStatus: "authenticated",
          checkedAt: NOW_ISO,
        },
      ],
      providerAccounts: [
        {
          provider: "codex",
          state: "authenticated",
          authMode: "chatgpt",
          requiresOpenaiAuth: false,
          account: {
            type: "chatgpt",
            email: "aellisatl@gmail.com",
            planType: "plus",
          },
          rateLimits: [
            {
              limitId: "codex",
              limitName: "Codex",
              planType: "plus",
              primary: {
                usedPercent: 0,
                windowDurationMins: 300,
                resetsAt: "2026-03-04T17:47:00.000Z",
              },
              secondary: {
                usedPercent: 100,
                windowDurationMins: 10_080,
                resetsAt: "2026-03-18T00:00:00.000Z",
              },
              credits: {
                hasCredits: true,
                unlimited: false,
                balance: "722.9550000000",
              },
            },
          ],
          login: {
            status: "idle",
            loginId: null,
            authUrl: null,
            error: null,
          },
          message: null,
          updatedAt: NOW_ISO,
        },
      ],
      availableEditors: [],
    },
    welcome: {
      cwd: "C:\\Users\\Addis\\source\\repos\\t3code-main",
      projectName: "t3code-main",
      bootstrapProjectId: PROJECT_ID,
      bootstrapThreadId: THREAD_ID,
    },
  };
}

function resolveWsRpc(tag: string): unknown {
  if (tag === ORCHESTRATION_WS_METHODS.getSnapshot) {
    return fixture.snapshot;
  }
  if (tag === WS_METHODS.serverGetConfig) {
    return fixture.serverConfig;
  }
  if (tag === WS_METHODS.gitListBranches) {
    return {
      isRepo: true,
      branches: [
        {
          name: "main",
          current: true,
          isDefault: true,
          worktreePath: null,
        },
      ],
    };
  }
  if (tag === WS_METHODS.gitStatus) {
    return {
      branch: "main",
      hasWorkingTreeChanges: false,
      workingTree: {
        files: [],
        insertions: 0,
        deletions: 0,
      },
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    };
  }
  if (tag === WS_METHODS.projectsSearchEntries) {
    return {
      entries: [],
      truncated: false,
    };
  }
  return {};
}

function applyDispatchCommand(command: ClientOrchestrationCommand): { sequence: number } {
  if (command.type === "thread.meta.update" && command.isPinned !== undefined) {
    const nextUpdatedAt = new Date(Date.parse(NOW_ISO) + nextSequence * 1_000).toISOString();
    fixture = {
      ...fixture,
      snapshot: {
        ...fixture.snapshot,
        snapshotSequence: nextSequence,
        updatedAt: nextUpdatedAt,
        threads: fixture.snapshot.threads.map((thread) =>
          thread.id === command.threadId
            ? {
                ...thread,
                isPinned: command.isPinned ?? thread.isPinned,
                updatedAt: nextUpdatedAt,
              }
            : thread,
        ),
      },
    };
  }

  return { sequence: nextSequence++ };
}

const worker = setupWorker(
  wsLink.addEventListener("connection", ({ client }) => {
    client.send(
      JSON.stringify({
        type: "push",
        channel: WS_CHANNELS.serverWelcome,
        data: fixture.welcome,
      }),
    );
    client.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      let request: WsRequestEnvelope;
      try {
        request = JSON.parse(event.data) as WsRequestEnvelope;
      } catch {
        return;
      }
      const method = request.body?._tag;
      if (typeof method !== "string") {
        return;
      }
      if (method === ORCHESTRATION_WS_METHODS.dispatchCommand) {
        const command = request.body.command as ClientOrchestrationCommand | undefined;
        if (command) {
          const result = applyDispatchCommand(command);
          client.send(
            JSON.stringify({
              id: request.id,
              result,
            }),
          );
          if (command.type === "thread.meta.update" && command.isPinned !== undefined) {
            client.send(
              JSON.stringify({
                type: "push",
                channel: ORCHESTRATION_WS_CHANNELS.domainEvent,
                data: {
                  sequence: result.sequence,
                  eventId: `event-${result.sequence}`,
                  aggregateKind: "thread",
                  aggregateId: command.threadId,
                  occurredAt:
                    fixture.snapshot.threads.find((thread) => thread.id === command.threadId)
                      ?.updatedAt ?? NOW_ISO,
                  commandId: command.commandId,
                  causationEventId: null,
                  correlationId: command.commandId,
                  metadata: {},
                  type: "thread.meta-updated",
                  payload: {
                    threadId: command.threadId,
                    isPinned: command.isPinned,
                    updatedAt:
                      fixture.snapshot.threads.find((thread) => thread.id === command.threadId)
                        ?.updatedAt ?? NOW_ISO,
                  },
                },
              }),
            );
          }
          return;
        }
      }
      client.send(
        JSON.stringify({
          id: request.id,
          result: resolveWsRpc(method),
        }),
      );
    });
  }),
  http.get("*/api/project-favicon", () => new HttpResponse(null, { status: 204 })),
);

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForLayout(): Promise<void> {
  await nextFrame();
  await nextFrame();
  await nextFrame();
}

async function waitForProductionStyles(): Promise<void> {
  await expect
    .poll(
      () => getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
      { timeout: 4_000, interval: 16 },
    )
    .not.toBe("");
}

function dispatchPointerDown(target: EventTarget | null): void {
  const EventCtor = window.PointerEvent ?? window.MouseEvent;
  target?.dispatchEvent(
    new EventCtor("pointerdown", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function mountSidebarApp() {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "100vw";
  host.style.height = "100vh";
  host.style.display = "grid";
  host.style.overflow = "hidden";
  document.body.append(host);

  const router = getRouter(
    createMemoryHistory({
      initialEntries: ["/"],
    }),
  );

  await render(<RouterProvider router={router} />, {
    container: host,
  });

  await page.viewport(1440, 960);
  await waitForLayout();
  await waitForProductionStyles();

  return {
    cleanup: async () => {
      if (host.isConnected) {
        host.remove();
      }
      document.querySelector("[data-testid='context-menu-overlay']")?.remove();
      document.querySelector("[data-testid='context-menu-fallback']")?.remove();
    },
  };
}

beforeAll(async () => {
  await worker.start({
    onUnhandledRequest: "error",
    serviceWorker: {
      url: "/mockServiceWorker.js",
    },
  });
});

afterAll(async () => {
  await worker.stop();
});

beforeEach(() => {
  fixture = createFixture();
  nextSequence = fixture.snapshot.snapshotSequence + 1;
  window.desktopBridge = {
    getWsUrl: () => `ws://${window.location.host}`,
    openExternal: async () => true,
    pickFolder: async () => null,
    confirm: async () => true,
  } as unknown as DesktopBridge;
  window.localStorage.clear();
  useStore.setState({
    projects: [],
    threads: [],
    threadsHydrated: false,
  });
  useComposerDraftStore.setState({
    draftThreadsByThreadId: {},
    projectDraftThreadIdByProjectId: {},
  });
});

afterEach(() => {
  worker.resetHandlers();
  Reflect.deleteProperty(window, "desktopBridge");
});

describe("Sidebar browser", () => {
  it("resolves browser fallback context-menu selection before outside dismissal", async () => {
    const resolveSpy = vi.fn();
    const resultPromise = showContextMenuFallback([{ id: "pin", label: "Pin thread" }]).then(
      (result) => {
        resolveSpy(result);
        return result;
      },
    );

    const button = document.querySelector<HTMLButtonElement>("[data-context-menu-item-id='pin']");
    const overlay = document.querySelector<HTMLDivElement>("[data-testid='context-menu-overlay']");

    expect(button).not.toBeNull();
    expect(overlay).not.toBeNull();

    dispatchPointerDown(button);
    dispatchPointerDown(overlay);

    await expect(resultPromise).resolves.toBe("pin");
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-testid='context-menu-fallback']")).toBeNull();
  });

  it("shows backend-backed projects and threads in the sidebar", async () => {
    const mounted = await mountSidebarApp();

    await expect
      .poll(() => document.body.textContent?.includes("t3code-main") ?? false, {
        timeout: 8_000,
        interval: 16,
      })
      .toBe(true);
    await expect
      .poll(
        () =>
          document.body.textContent?.includes("Settings popover backend wiring") ?? false,
        {
          timeout: 8_000,
          interval: 16,
        },
      )
      .toBe(true);

    await mounted.cleanup();
  });

  it("opens the settings popover with authenticated account data and rate limits", async () => {
    const mounted = await mountSidebarApp();

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect.element(page.getByText("aellisatl@gmail.com")).toBeVisible();
    await expect.element(page.getByText("Personal account")).toBeVisible();

    await page.getByRole("button", { name: /Rate limits remaining 0%/ }).click();
    await expect.element(page.getByText("5h")).toBeVisible();
    await expect.element(page.getByText("Weekly")).toBeVisible();
    await expect.element(page.getByText("Upgrade to Pro")).toBeVisible();
    await expect.element(page.getByText("Learn more")).toBeVisible();

    await mounted.cleanup();
  });

  it("renders pinned threads before unpinned threads within the same project", async () => {
    fixture = {
      ...fixture,
      snapshot: {
        ...fixture.snapshot,
        threads: [
          {
            ...fixture.snapshot.threads[0]!,
            id: "thread-unpinned" as ThreadId,
            title: "Unpinned thread",
            createdAt: "2026-03-04T12:02:00.000Z",
            updatedAt: "2026-03-04T12:02:00.000Z",
            isPinned: false,
            session: null,
            latestTurn: null,
          },
          {
            ...fixture.snapshot.threads[0]!,
            id: "thread-pinned" as ThreadId,
            title: "Pinned thread",
            createdAt: "2026-03-04T12:01:00.000Z",
            updatedAt: "2026-03-04T12:01:00.000Z",
            isPinned: true,
            session: null,
            latestTurn: null,
          },
        ],
      },
      welcome: {
        ...fixture.welcome,
        bootstrapThreadId: "thread-pinned" as ThreadId,
      },
    };

    const mounted = await mountSidebarApp();

    await expect
      .poll(() => {
        const sidebarText = document.body.textContent ?? "";
        return sidebarText.indexOf("Pinned thread") < sidebarText.indexOf("Unpinned thread");
      })
      .toBe(true);

    await mounted.cleanup();
  });

  it("pins a thread through the browser fallback context menu and persists after remount", async () => {
    fixture = {
      ...fixture,
      snapshot: {
        ...fixture.snapshot,
        threads: [
          {
            ...fixture.snapshot.threads[0]!,
            id: "thread-newer" as ThreadId,
            title: "Newer thread",
            createdAt: "2026-03-04T12:02:00.000Z",
            updatedAt: "2026-03-04T12:02:00.000Z",
            isPinned: false,
            session: null,
            latestTurn: null,
          },
          {
            ...fixture.snapshot.threads[0]!,
            id: "thread-older" as ThreadId,
            title: "Older thread",
            createdAt: "2026-03-04T12:01:00.000Z",
            updatedAt: "2026-03-04T12:01:00.000Z",
            isPinned: false,
            session: null,
            latestTurn: null,
          },
        ],
      },
      welcome: {
        ...fixture.welcome,
        bootstrapThreadId: "thread-newer" as ThreadId,
      },
    };

    const mounted = await mountSidebarApp();

    await expect
      .poll(() => {
        const sidebarText = document.body.textContent ?? "";
        return sidebarText.indexOf("Newer thread") < sidebarText.indexOf("Older thread");
      })
      .toBe(true);

    await page.getByRole("button", { name: /Older thread/ }).click({ button: "right" });
    await expect.element(page.getByRole("button", { name: "Pin thread" })).toBeVisible();
    await page.getByRole("button", { name: "Pin thread" }).click();

    await expect
      .poll(() => {
        const sidebarText = document.body.textContent ?? "";
        return sidebarText.indexOf("Older thread") < sidebarText.indexOf("Newer thread");
      })
      .toBe(true);

    await page.getByRole("button", { name: /Older thread/ }).click({ button: "right" });
    await expect.element(page.getByRole("button", { name: "Unpin thread" })).toBeVisible();

    await mounted.cleanup();

    const remounted = await mountSidebarApp();
    await expect
      .poll(() => {
        const sidebarText = document.body.textContent ?? "";
        return sidebarText.indexOf("Older thread") < sidebarText.indexOf("Newer thread");
      })
      .toBe(true);

    await page.getByRole("button", { name: /Older thread/ }).click({ button: "right" });
    await expect.element(page.getByRole("button", { name: "Unpin thread" })).toBeVisible();

    await remounted.cleanup();
  });
});
