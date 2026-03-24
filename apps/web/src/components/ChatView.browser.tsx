// Production CSS is part of the behavior under test because row height depends on it.
import "../index.css";

import {
  EventId,
  ORCHESTRATION_WS_METHODS,
  type MessageId,
  type OrchestrationProposedPlanId,
  type OrchestrationReadModel,
  type ProjectId,
  type ServerConfig,
  type ThreadId,
  type TurnId,
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

import { useComposerDraftStore } from "../composerDraftStore";
import { getRouter } from "../router";
import { useStore } from "../store";
import { estimateTimelineMessageHeight } from "./timelineHeight";

const THREAD_ID = "thread-browser-test" as ThreadId;
const PROJECT_ID = "project-1" as ProjectId;
const NOW_ISO = "2026-03-04T12:00:00.000Z";
const BASE_TIME_MS = Date.parse(NOW_ISO);
const ATTACHMENT_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='300'></svg>";
const USER_MARKDOWN_TEXT = [
  "# User heading",
  "",
  "- first item",
  "- second item",
  "",
  "> quoted note",
  "",
  "Inline `code` sample",
  "",
  "```ts",
  "const value = 1;",
  "```",
].join("\n");

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
const wsRequests: WsRequestEnvelope["body"][] = [];
const wsLink = ws.link(/ws(s)?:\/\/.*/);

interface ViewportSpec {
  name: string;
  width: number;
  height: number;
  textTolerancePx: number;
  attachmentTolerancePx: number;
}

const DEFAULT_VIEWPORT: ViewportSpec = {
  name: "desktop",
  width: 960,
  height: 1_100,
  textTolerancePx: 44,
  attachmentTolerancePx: 56,
};
const TEXT_VIEWPORT_MATRIX = [
  DEFAULT_VIEWPORT,
  { name: "tablet", width: 720, height: 1_024, textTolerancePx: 44, attachmentTolerancePx: 56 },
  { name: "mobile", width: 430, height: 932, textTolerancePx: 56, attachmentTolerancePx: 56 },
  { name: "narrow", width: 320, height: 700, textTolerancePx: 84, attachmentTolerancePx: 56 },
] as const satisfies readonly ViewportSpec[];
const ATTACHMENT_VIEWPORT_MATRIX = [
  DEFAULT_VIEWPORT,
  { name: "mobile", width: 430, height: 932, textTolerancePx: 56, attachmentTolerancePx: 56 },
  { name: "narrow", width: 320, height: 700, textTolerancePx: 84, attachmentTolerancePx: 56 },
] as const satisfies readonly ViewportSpec[];

interface UserRowMeasurement {
  measuredRowHeightPx: number;
  timelineWidthMeasuredPx: number;
  renderedInVirtualizedRegion: boolean;
}

interface MountedChatView {
  cleanup: () => Promise<void>;
  measureUserRow: (targetMessageId: MessageId) => Promise<UserRowMeasurement>;
  setViewport: (viewport: ViewportSpec) => Promise<void>;
}

function isoAt(offsetSeconds: number): string {
  return new Date(BASE_TIME_MS + offsetSeconds * 1_000).toISOString();
}

function createBaseServerConfig(): ServerConfig {
  return {
    cwd: "/repo/project",
    keybindingsConfigPath: "/repo/project/.t3code-keybindings.json",
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
    providerAccounts: [],
    availableEditors: [],
  };
}

function createUserMessage(options: {
  id: MessageId;
  text: string;
  offsetSeconds: number;
  attachments?: Array<{
    type: "image";
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}) {
  return {
    id: options.id,
    role: "user" as const,
    text: options.text,
    ...(options.attachments ? { attachments: options.attachments } : {}),
    turnId: null,
    streaming: false,
    createdAt: isoAt(options.offsetSeconds),
    updatedAt: isoAt(options.offsetSeconds + 1),
  };
}

function createAssistantMessage(options: { id: MessageId; text: string; offsetSeconds: number }) {
  return {
    id: options.id,
    role: "assistant" as const,
    text: options.text,
    turnId: null,
    streaming: false,
    createdAt: isoAt(options.offsetSeconds),
    updatedAt: isoAt(options.offsetSeconds + 1),
  };
}

function createSnapshotForTargetUser(options: {
  targetMessageId: MessageId;
  targetText: string;
  targetAttachmentCount?: number;
}): OrchestrationReadModel {
  const messages: Array<OrchestrationReadModel["threads"][number]["messages"][number]> = [];

  for (let index = 0; index < 22; index += 1) {
    const isTarget = index === 3;
    const userId = `msg-user-${index}` as MessageId;
    const assistantId = `msg-assistant-${index}` as MessageId;
    const attachments =
      isTarget && (options.targetAttachmentCount ?? 0) > 0
        ? Array.from({ length: options.targetAttachmentCount ?? 0 }, (_, attachmentIndex) => ({
            type: "image" as const,
            id: `attachment-${attachmentIndex + 1}`,
            name: `attachment-${attachmentIndex + 1}.png`,
            mimeType: "image/png",
            sizeBytes: 128,
          }))
        : undefined;

    messages.push(
      createUserMessage({
        id: isTarget ? options.targetMessageId : userId,
        text: isTarget ? options.targetText : `filler user message ${index}`,
        offsetSeconds: messages.length * 3,
        ...(attachments ? { attachments } : {}),
      }),
    );
    messages.push(
      createAssistantMessage({
        id: assistantId,
        text: `assistant filler ${index}`,
        offsetSeconds: messages.length * 3,
      }),
    );
  }

  return {
    snapshotSequence: 1,
    projects: [
      {
        id: PROJECT_ID,
        title: "Project",
        workspaceRoot: "/repo/project",
        defaultModel: "gpt-5",
        scripts: [],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
      },
    ],
    tasks: [],
    taskRuntimes: [],
    projectRules: [],
    threads: [
      {
        id: THREAD_ID,
        projectId: PROJECT_ID,
        origin: "user",
        taskId: null,
        title: "Browser test thread",
        model: "gpt-5",
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: "main",
        worktreePath: null,
        isPinned: false,
        latestTurn: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        messages,
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: NOW_ISO,
        },
      },
    ],
    updatedAt: NOW_ISO,
  };
}

function buildFixture(snapshot: OrchestrationReadModel): TestFixture {
  return {
    snapshot,
    serverConfig: createBaseServerConfig(),
    welcome: {
      cwd: "/repo/project",
      projectName: "Project",
      bootstrapProjectId: PROJECT_ID,
      bootstrapThreadId: THREAD_ID,
    },
  };
}

function createDraftOnlySnapshot(): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-draft-target" as MessageId,
    targetText: "draft thread",
  });
  return {
    ...snapshot,
    threads: [],
  };
}

function createSelectionFeatureSnapshot(): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    projects: [
      {
        id: PROJECT_ID,
        title: "Project",
        workspaceRoot: "/repo/project",
        defaultModel: "gpt-5",
        scripts: [],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
      },
    ],
    tasks: [],
    taskRuntimes: [],
    projectRules: [],
    threads: [
      {
        id: THREAD_ID,
        projectId: PROJECT_ID,
        origin: "user",
        taskId: null,
        title: "Selection feature thread",
        model: "gpt-5",
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: "main",
        worktreePath: null,
        isPinned: false,
        latestTurn: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        messages: [
          createUserMessage({
            id: "msg-user-selection" as MessageId,
            text: "User question about daemons",
            offsetSeconds: 0,
          }),
          createAssistantMessage({
            id: "msg-assistant-selection" as MessageId,
            text: "A daemon is a background process that runs without direct user interaction.",
            offsetSeconds: 3,
          }),
        ],
        activities: [],
        proposedPlans: [
          {
            id: "plan-selection-1" as OrchestrationProposedPlanId,
            turnId: null,
            planMarkdown: "# Plan heading\n\nExplain this planned change.",
            createdAt: isoAt(6),
            updatedAt: isoAt(6),
          },
        ],
        checkpoints: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: NOW_ISO,
        },
      },
    ],
    updatedAt: NOW_ISO,
  };
}

function createActivePlanRegressionSnapshot(options: {
  latestTurnInteractionMode: "default" | "plan";
}): OrchestrationReadModel {
  const historicalTurnId = "turn-plan-history" as TurnId;
  const latestTurnId = "turn-plan-latest" as TurnId;

  return {
    snapshotSequence: 1,
    projects: [
      {
        id: PROJECT_ID,
        title: "Project",
        workspaceRoot: "/repo/project",
        defaultModel: "gpt-5",
        scripts: [],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
      },
    ],
    tasks: [],
    taskRuntimes: [],
    projectRules: [],
    threads: [
      {
        id: THREAD_ID,
        projectId: PROJECT_ID,
        origin: "user",
        taskId: null,
        title: "Plan regression thread",
        model: "gpt-5",
        interactionMode: options.latestTurnInteractionMode,
        runtimeMode: "full-access",
        branch: "main",
        worktreePath: null,
        isPinned: false,
        latestTurn: {
          turnId: latestTurnId,
          state: "running",
          interactionMode: options.latestTurnInteractionMode,
          requestedAt: isoAt(9),
          startedAt: isoAt(10),
          completedAt: null,
          assistantMessageId: null,
        },
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        messages: [
          createUserMessage({
            id: "msg-user-plan-regression" as MessageId,
            text: "Implement the plan",
            offsetSeconds: 0,
          }),
          createAssistantMessage({
            id: "msg-assistant-plan-regression" as MessageId,
            text: "Starting implementation",
            offsetSeconds: 3,
          }),
        ],
        activities: [
          {
            id: EventId.makeUnsafe("activity-plan-latest"),
            tone: "info",
            kind: "turn.plan.updated",
            summary: "Plan updated",
            payload: {
              explanation: "Active plan explanation",
              plan: [{ step: "Active implementation step", status: "inProgress" }],
            },
            turnId: latestTurnId,
            createdAt: isoAt(12),
          },
        ],
        proposedPlans: [
          {
            id: "plan-history-1" as OrchestrationProposedPlanId,
            turnId: historicalTurnId,
            planMarkdown: "# Historical plan card\n\nKeep this visible.",
            createdAt: isoAt(6),
            updatedAt: isoAt(6),
          },
        ],
        checkpoints: [],
        session: {
          threadId: THREAD_ID,
          status: "running",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: latestTurnId,
          lastError: null,
          updatedAt: NOW_ISO,
        },
      },
    ],
    updatedAt: NOW_ISO,
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
      const rawData = event.data;
      if (typeof rawData !== "string") return;
      let request: WsRequestEnvelope;
      try {
        request = JSON.parse(rawData) as WsRequestEnvelope;
      } catch {
        return;
      }
      const method = request.body?._tag;
      if (typeof method !== "string") return;
      wsRequests.push(request.body);
      client.send(
        JSON.stringify({
          id: request.id,
          result: resolveWsRpc(method),
        }),
      );
    });
  }),
  http.get("*/attachments/:attachmentId", () =>
    HttpResponse.text(ATTACHMENT_SVG, {
      headers: {
        "Content-Type": "image/svg+xml",
      },
    }),
  ),
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

async function setViewport(viewport: ViewportSpec): Promise<void> {
  await page.viewport(viewport.width, viewport.height);
  await waitForLayout();
}

async function waitForProductionStyles(): Promise<void> {
  await vi.waitFor(
    () => {
      expect(getComputedStyle(document.documentElement).getPropertyValue("--background").trim()).not.toBe(
        "",
      );
      expect(getComputedStyle(document.body).marginTop).toBe("0px");
    },
    {
      timeout: 4_000,
      interval: 16,
    },
  );
}

async function waitForElement<T extends Element>(
  query: () => T | null,
  errorMessage: string,
): Promise<T> {
  let element: T | null = null;
  await vi.waitFor(
    () => {
      element = query();
      expect(element, errorMessage).toBeTruthy();
    },
    {
      timeout: 8_000,
      interval: 16,
    },
  );
  if (!element) {
    throw new Error(errorMessage);
  }
  return element;
}

async function waitForComposerEditor(): Promise<HTMLElement> {
  return waitForElement(
    () => document.querySelector<HTMLElement>('[contenteditable="true"]'),
    "Unable to find composer editor.",
  );
}

function findFirstTextNode(root: Node): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.textContent?.trim().length) {
      return current as Text;
    }
    current = walker.nextNode();
  }
  return null;
}

async function selectTextInElement(element: Element): Promise<void> {
  const textNode = findFirstTextNode(element);
  if (!textNode || !textNode.textContent) {
    throw new Error("Unable to find selectable text node.");
  }

  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, textNode.textContent.length);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  await waitForLayout();
}

async function clearSelectedText(): Promise<void> {
  window.getSelection()?.removeAllRanges();
  document.dispatchEvent(new Event("selectionchange"));
  await waitForLayout();
}

async function waitForSelectionActionButton(
  ariaLabel: "Quote selected text" | "Pin selected text",
): Promise<HTMLButtonElement> {
  return waitForElement(
    () => document.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`),
    `Unable to find selection action button: ${ariaLabel}.`,
  );
}

async function waitForInteractionModeButton(expectedLabel: "Chat" | "Plan"): Promise<HTMLButtonElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === expectedLabel,
      ) as HTMLButtonElement | null,
    `Unable to find ${expectedLabel} interaction mode button.`,
  );
}

async function waitForImagesToLoad(scope: ParentNode): Promise<void> {
  const images = Array.from(scope.querySelectorAll("img"));
  if (images.length === 0) {
    return;
  }
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
  await waitForLayout();
}

async function measureUserRow(options: {
  host: HTMLElement;
  targetMessageId: MessageId;
}): Promise<UserRowMeasurement> {
  const { host, targetMessageId } = options;
  const rowSelector = `[data-message-id="${targetMessageId}"][data-message-role="user"]`;

  const scrollContainer = await waitForElement(
    () => host.querySelector<HTMLDivElement>("div.overflow-y-auto.overscroll-y-contain"),
    "Unable to find ChatView message scroll container.",
  );

  let row: HTMLElement | null = null;
  await vi.waitFor(
    async () => {
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event("scroll"));
      await waitForLayout();
      row = host.querySelector<HTMLElement>(rowSelector);
      expect(row, "Unable to locate targeted user message row.").toBeTruthy();
    },
    {
      timeout: 8_000,
      interval: 16,
    },
  );

  await waitForImagesToLoad(row!);
  scrollContainer.scrollTop = 0;
  scrollContainer.dispatchEvent(new Event("scroll"));
  await nextFrame();

  const timelineRoot =
    row!.closest<HTMLElement>('[data-timeline-root="true"]') ??
    host.querySelector<HTMLElement>('[data-timeline-root="true"]');
  if (!(timelineRoot instanceof HTMLElement)) {
    throw new Error("Unable to locate timeline root container.");
  }

  let timelineWidthMeasuredPx = 0;
  let measuredRowHeightPx = 0;
  let renderedInVirtualizedRegion = false;
  await vi.waitFor(
    async () => {
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event("scroll"));
      await nextFrame();
      const measuredRow = host.querySelector<HTMLElement>(rowSelector);
      expect(measuredRow, "Unable to measure targeted user row height.").toBeTruthy();
      timelineWidthMeasuredPx = timelineRoot.getBoundingClientRect().width;
      measuredRowHeightPx = measuredRow!.getBoundingClientRect().height;
      renderedInVirtualizedRegion = measuredRow!.closest("[data-index]") instanceof HTMLElement;
      expect(timelineWidthMeasuredPx, "Unable to measure timeline width.").toBeGreaterThan(0);
      expect(measuredRowHeightPx, "Unable to measure targeted user row height.").toBeGreaterThan(0);
    },
    {
      timeout: 4_000,
      interval: 16,
    },
  );

  return { measuredRowHeightPx, timelineWidthMeasuredPx, renderedInVirtualizedRegion };
}

async function mountChatView(options: {
  viewport: ViewportSpec;
  snapshot: OrchestrationReadModel;
  configureFixture?: (fixture: TestFixture) => void;
}): Promise<MountedChatView> {
  fixture = buildFixture(options.snapshot);
  options.configureFixture?.(fixture);
  await setViewport(options.viewport);
  await waitForProductionStyles();

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
      initialEntries: [`/${THREAD_ID}`],
    }),
  );

  const screen = await render(<RouterProvider router={router} />, {
    container: host,
  });

  await waitForLayout();

  return {
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
    measureUserRow: async (targetMessageId: MessageId) => measureUserRow({ host, targetMessageId }),
    setViewport: async (viewport: ViewportSpec) => {
      await setViewport(viewport);
      await waitForProductionStyles();
    },
  };
}

async function measureUserRowAtViewport(options: {
  snapshot: OrchestrationReadModel;
  targetMessageId: MessageId;
  viewport: ViewportSpec;
}): Promise<UserRowMeasurement> {
  const mounted = await mountChatView({
    viewport: options.viewport,
    snapshot: options.snapshot,
  });

  try {
    return await mounted.measureUserRow(options.targetMessageId);
  } finally {
    await mounted.cleanup();
  }
}

describe("ChatView timeline estimator parity (full app)", () => {
  beforeAll(async () => {
    fixture = buildFixture(
      createSnapshotForTargetUser({
        targetMessageId: "msg-user-bootstrap" as MessageId,
        targetText: "bootstrap",
      }),
    );
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: {
        url: "/mockServiceWorker.js",
      },
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  beforeEach(async () => {
    await setViewport(DEFAULT_VIEWPORT);
    localStorage.clear();
    document.body.innerHTML = "";
    wsRequests.length = 0;
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
    useStore.setState({
      projects: [],
      threads: [],
      threadsHydrated: false,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the desktop thread shell with rounded corners and no shell dividers", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-shell-check" as MessageId,
        targetText: "check shell chrome",
      }),
    });

    try {
      const shell = document.querySelector<HTMLElement>("[data-testid='chat-thread-shell']");
      const sidebarContainer = document.querySelector<HTMLElement>("[data-slot='sidebar-container']");
      const header = document.querySelector<HTMLElement>("header");

      expect(shell).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();
      expect(header).not.toBeNull();

      expect(window.getComputedStyle(shell!).borderTopLeftRadius).toBe("18px");
      expect(window.getComputedStyle(shell!).borderTopRightRadius).toBe("18px");
      expect(window.getComputedStyle(sidebarContainer!).borderRightWidth).toBe("0px");
      expect(window.getComputedStyle(header!).borderBottomWidth).toBe("0px");
    } finally {
      await mounted.cleanup();
    }
  });

  it.each(TEXT_VIEWPORT_MATRIX)(
    "keeps long user message estimate close at the $name viewport",
    async (viewport) => {
      const userText = "x".repeat(3_200);
      const targetMessageId = `msg-user-target-long-${viewport.name}` as MessageId;
      const mounted = await mountChatView({
        viewport,
        snapshot: createSnapshotForTargetUser({
          targetMessageId,
          targetText: userText,
        }),
      });

      try {
        const { measuredRowHeightPx, timelineWidthMeasuredPx, renderedInVirtualizedRegion } =
          await mounted.measureUserRow(targetMessageId);

        expect(renderedInVirtualizedRegion).toBe(true);

        const estimatedHeightPx = estimateTimelineMessageHeight(
          { role: "user", text: userText, attachments: [] },
          { timelineWidthPx: timelineWidthMeasuredPx },
        );

        expect(Math.abs(measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.textTolerancePx,
        );
      } finally {
        await mounted.cleanup();
      }
    },
  );

  it("tracks wrapping parity while resizing an existing ChatView across the viewport matrix", async () => {
    const userText = "x".repeat(3_200);
    const targetMessageId = "msg-user-target-resize" as MessageId;
    const mounted = await mountChatView({
      viewport: TEXT_VIEWPORT_MATRIX[0],
      snapshot: createSnapshotForTargetUser({
        targetMessageId,
        targetText: userText,
      }),
    });

    try {
      const measurements: Array<UserRowMeasurement & { viewport: ViewportSpec; estimatedHeightPx: number }> = [];

      for (const viewport of TEXT_VIEWPORT_MATRIX) {
        await mounted.setViewport(viewport);
        const measurement = await mounted.measureUserRow(targetMessageId);
        const estimatedHeightPx = estimateTimelineMessageHeight(
          { role: "user", text: userText, attachments: [] },
          { timelineWidthPx: measurement.timelineWidthMeasuredPx },
        );

        expect(measurement.renderedInVirtualizedRegion).toBe(true);
        expect(Math.abs(measurement.measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.textTolerancePx,
        );
        measurements.push({ ...measurement, viewport, estimatedHeightPx });
      }

      expect(new Set(measurements.map((measurement) => Math.round(measurement.timelineWidthMeasuredPx))).size).toBeGreaterThanOrEqual(3);

      const byMeasuredWidth = measurements.toSorted(
        (left, right) => left.timelineWidthMeasuredPx - right.timelineWidthMeasuredPx,
      );
      const narrowest = byMeasuredWidth[0]!;
      const widest = byMeasuredWidth.at(-1)!;
      expect(narrowest.timelineWidthMeasuredPx).toBeLessThan(widest.timelineWidthMeasuredPx);
      expect(narrowest.measuredRowHeightPx).toBeGreaterThan(widest.measuredRowHeightPx);
      expect(narrowest.estimatedHeightPx).toBeGreaterThan(widest.estimatedHeightPx);
    } finally {
      await mounted.cleanup();
    }
  });

  it("tracks additional rendered wrapping when ChatView width narrows between desktop and mobile viewports", async () => {
    const userText = "x".repeat(2_400);
    const targetMessageId = "msg-user-target-wrap" as MessageId;
    const snapshot = createSnapshotForTargetUser({
      targetMessageId,
      targetText: userText,
    });
    const desktopMeasurement = await measureUserRowAtViewport({
      viewport: TEXT_VIEWPORT_MATRIX[0],
      snapshot,
      targetMessageId,
    });
    const mobileMeasurement = await measureUserRowAtViewport({
      viewport: TEXT_VIEWPORT_MATRIX[2],
      snapshot,
      targetMessageId,
    });

    const estimatedDesktopPx = estimateTimelineMessageHeight(
      { role: "user", text: userText, attachments: [] },
      { timelineWidthPx: desktopMeasurement.timelineWidthMeasuredPx },
    );
    const estimatedMobilePx = estimateTimelineMessageHeight(
      { role: "user", text: userText, attachments: [] },
      { timelineWidthPx: mobileMeasurement.timelineWidthMeasuredPx },
    );

    const measuredDeltaPx = mobileMeasurement.measuredRowHeightPx - desktopMeasurement.measuredRowHeightPx;
    const estimatedDeltaPx = estimatedMobilePx - estimatedDesktopPx;
    expect(measuredDeltaPx).toBeGreaterThan(0);
    expect(estimatedDeltaPx).toBeGreaterThan(0);
    const ratio = estimatedDeltaPx / measuredDeltaPx;
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(1.35);
  });

  it.each(ATTACHMENT_VIEWPORT_MATRIX)(
    "keeps user attachment estimate close at the $name viewport",
    async (viewport) => {
      const targetMessageId = `msg-user-target-attachments-${viewport.name}` as MessageId;
      const userText = "message with image attachments";
      const mounted = await mountChatView({
        viewport,
        snapshot: createSnapshotForTargetUser({
          targetMessageId,
          targetText: userText,
          targetAttachmentCount: 3,
        }),
      });

      try {
        const { measuredRowHeightPx, timelineWidthMeasuredPx, renderedInVirtualizedRegion } =
          await mounted.measureUserRow(targetMessageId);

        expect(renderedInVirtualizedRegion).toBe(true);

        const estimatedHeightPx = estimateTimelineMessageHeight(
          {
            role: "user",
            text: userText,
            attachments: [{ id: "attachment-1" }, { id: "attachment-2" }, { id: "attachment-3" }],
          },
          { timelineWidthPx: timelineWidthMeasuredPx },
        );

        expect(Math.abs(measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.attachmentTolerancePx,
        );
      } finally {
        await mounted.cleanup();
      }
    },
  );

  it("renders user-authored markdown and keeps actions in a detached footer row", async () => {
    const targetMessageId = "msg-user-markdown-render" as MessageId;
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId,
        targetText: USER_MARKDOWN_TEXT,
      }),
    });

    try {
      const row = await waitForElement(
        () =>
          document.querySelector<HTMLElement>(
            `[data-message-id="${targetMessageId}"][data-message-role="user"]`,
          ),
        "Unable to find targeted markdown user row.",
      );
      const bubble = await waitForElement(
        () => row.querySelector<HTMLElement>('[data-user-message-bubble="true"]'),
        "Unable to find user message bubble.",
      );
      const footer = await waitForElement(
        () => row.querySelector<HTMLElement>('[data-user-message-footer="true"]'),
        "Unable to find user message footer.",
      );

      expect(bubble.querySelector("h1")?.textContent).toContain("User heading");
      expect(bubble.querySelectorAll("li")).toHaveLength(2);
      expect(bubble.querySelector("blockquote")?.textContent).toContain("quoted note");
      expect(bubble.querySelector("p code")?.textContent).toBe("code");
      expect(bubble.querySelector("pre code")?.textContent).toContain("const value = 1;");

      const copyButton = row.querySelector<HTMLButtonElement>('button[title="Copy message"]');
      expect(copyButton).toBeTruthy();
      expect(footer.contains(copyButton)).toBe(true);
      expect(bubble.contains(copyButton)).toBe(false);
      expect(footer.previousElementSibling).toBe(bubble);
      expect(footer.querySelector("p")?.textContent?.trim().length).toBeGreaterThan(0);
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps markdown-heavy user rows measurable in the virtualized region", async () => {
    const targetMessageId = "msg-user-target-markdown-heavy" as MessageId;
    const userText = `${USER_MARKDOWN_TEXT}\n\n${"x".repeat(2_000)}`;
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId,
        targetText: userText,
      }),
    });

    try {
      const { measuredRowHeightPx, renderedInVirtualizedRegion } =
        await mounted.measureUserRow(targetMessageId);

      expect(renderedInVirtualizedRegion).toBe(true);
      expect(measuredRowHeightPx).toBeGreaterThan(0);

      const heading = await waitForElement(
        () =>
          document.querySelector<HTMLElement>(
            `[data-message-id="${targetMessageId}"][data-message-role="user"] [data-user-message-bubble="true"] h1`,
          ),
        "Unable to find markdown heading in the heavy user row.",
      );
      expect(heading.textContent).toContain("User heading");
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows the quote selection action for assistant markdown and inserts the quoted text into the composer", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSelectionFeatureSnapshot(),
    });

    try {
      const assistantParagraph = await waitForElement(
        () =>
          document.querySelector<HTMLElement>(
            '[data-message-role="assistant"] [data-chat-selection-region="assistant-output"] p',
          ),
        "Unable to find assistant markdown paragraph.",
      );

      await selectTextInElement(assistantParagraph);

      const quoteButton = await waitForSelectionActionButton("Quote selected text");
      quoteButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      quoteButton.click();

      await vi.waitFor(
        () => {
          const prompt =
            useComposerDraftStore.getState().draftsByThreadId[THREAD_ID]?.prompt ?? "";
          expect(prompt).toBe(
            "> A daemon is a background process that runs without direct user interaction.\n\n",
          );
        },
        { timeout: 8_000, interval: 16 },
      );

      const composerEditor = await waitForComposerEditor();
      expect(document.activeElement).toBe(composerEditor);
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not show the selection action for user-authored messages", async () => {
    const targetMessageId = "msg-user-markdown-selection" as MessageId;
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId,
        targetText: USER_MARKDOWN_TEXT,
      }),
    });

    try {
      const userMessage = await waitForElement(
        () =>
          document.querySelector<HTMLElement>(
            `[data-message-id="${targetMessageId}"][data-message-role="user"] [data-user-message-bubble="true"] h1`,
          ),
        "Unable to find user message text.",
      );

      await selectTextInElement(userMessage);
      await waitForLayout();

      expect(document.querySelector('button[aria-label="Quote selected text"]')).toBeNull();
      expect(document.querySelector('button[aria-label="Pin selected text"]')).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows both selection actions for proposed plan markdown", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSelectionFeatureSnapshot(),
    });

    try {
      const planHeading = await waitForElement(
        () =>
          document.querySelector<HTMLElement>(
            '[data-timeline-row-kind="proposed-plan"] [data-chat-selection-region="assistant-output"] h1',
          ),
        "Unable to find proposed plan heading.",
      );

      await selectTextInElement(planHeading);
      await waitForSelectionActionButton("Quote selected text");
      await waitForSelectionActionButton("Pin selected text");
      await clearSelectedText();

      await vi.waitFor(
        () => {
          expect(document.querySelector('button[aria-label="Quote selected text"]')).toBeNull();
          expect(document.querySelector('button[aria-label="Pin selected text"]')).toBeNull();
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("pins multiple passages, keeps them after send, and sends only the typed prompt", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSelectionFeatureSnapshot(),
    });

    try {
      const assistantParagraph = await waitForElement(
        () =>
          document.querySelector<HTMLElement>(
            '[data-message-role="assistant"] [data-chat-selection-region="assistant-output"] p',
          ),
        "Unable to find assistant markdown paragraph.",
      );
      await selectTextInElement(assistantParagraph);
      const pinButton = await waitForSelectionActionButton("Pin selected text");
      pinButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      pinButton.click();

      const planHeading = await waitForElement(
        () =>
          document.querySelector<HTMLElement>(
            '[data-timeline-row-kind="proposed-plan"] [data-chat-selection-region="assistant-output"] h1',
          ),
        "Unable to find proposed plan heading.",
      );
      await selectTextInElement(planHeading);
      const secondPinButton = await waitForSelectionActionButton("Pin selected text");
      secondPinButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      secondPinButton.click();

      await vi.waitFor(
        () => {
          expect(
            Array.from(document.querySelectorAll("button")).some((button) =>
              button.textContent?.includes("A daemon is a background process"),
            ),
          ).toBe(true);
          expect(
            Array.from(document.querySelectorAll("button")).some((button) =>
              button.textContent?.includes("Plan heading"),
            ),
          ).toBe(true);
          expect(useComposerDraftStore.getState().draftsByThreadId[THREAD_ID]?.pinnedSelections).toHaveLength(
            2,
          );
        },
        { timeout: 8_000, interval: 16 },
      );

      useComposerDraftStore.getState().setPrompt(THREAD_ID, "Can you clarify these points?");
      await waitForLayout();

      const sendButton = await waitForElement(
        () =>
          document.querySelector<HTMLButtonElement>('button[aria-label="Send message"]'),
        "Unable to find send button.",
      );
      sendButton.click();

      await vi.waitFor(
        () => {
          const turnStartRequest = wsRequests.findLast(
            (request) => request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand,
          ) as
            | { command?: { type?: string; message?: { text?: string } } }
            | undefined;
          expect(turnStartRequest?.command?.type).toBe("thread.turn.start");
          expect(turnStartRequest?.command?.message?.text).toBe("Can you clarify these points?");
        },
        { timeout: 8_000, interval: 16 },
      );

      expect(useComposerDraftStore.getState().draftsByThreadId[THREAD_ID]?.pinnedSelections ?? []).toHaveLength(
        2,
      );
      expect(
        Array.from(document.querySelectorAll("button")).some((button) =>
          button.textContent?.includes("A daemon is a background process"),
        ),
      ).toBe(true);
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens the project cwd for draft threads without a worktree path", async () => {
    useComposerDraftStore.setState({
      draftThreadsByThreadId: {
        [THREAD_ID]: {
          projectId: PROJECT_ID,
          createdAt: NOW_ISO,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          envMode: "local",
        },
      },
      projectDraftThreadIdByProjectId: {
        [PROJECT_ID]: THREAD_ID,
      },
    });

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createDraftOnlySnapshot(),
      configureFixture: (nextFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          availableEditors: ["vscode"],
        };
      },
    });

    try {
      const openButton = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Open",
          ) as HTMLButtonElement | null,
        "Unable to find Open button.",
      );
      openButton.click();

      await vi.waitFor(
        () => {
          const openRequest = wsRequests.find((request) => request._tag === WS_METHODS.shellOpenInEditor);
          expect(openRequest).toMatchObject({
            _tag: WS_METHODS.shellOpenInEditor,
            cwd: "/repo/project",
            editor: "vscode",
          });
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not render the active plan panel for a default-mode latest turn", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createActivePlanRegressionSnapshot({
        latestTurnInteractionMode: "default",
      }),
    });

    try {
      await waitForElement(
        () =>
          Array.from(document.querySelectorAll("h1")).find((heading) =>
            heading.textContent?.includes("Historical plan card"),
          ) as HTMLElement | null,
        "Unable to find historical proposed plan card.",
      );

      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("Historical plan card");
          expect(document.body.textContent).not.toContain("Active plan explanation");
          expect(document.body.textContent).not.toContain("Active implementation step");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("renders the active plan panel for a plan-mode latest turn", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createActivePlanRegressionSnapshot({
        latestTurnInteractionMode: "plan",
      }),
    });

    try {
      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("Active plan explanation");
          expect(document.body.textContent).toContain("Active implementation step");
          expect(document.body.textContent).toContain("Historical plan card");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("toggles plan mode with Shift+Tab only while the composer is focused", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-hotkey" as MessageId,
        targetText: "hotkey target",
      }),
    });

    try {
      const initialModeButton = await waitForInteractionModeButton("Chat");
      expect(initialModeButton.title).toContain("enter plan mode");

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      await waitForLayout();

      expect((await waitForInteractionModeButton("Chat")).title).toContain("enter plan mode");

      const composerEditor = await waitForComposerEditor();
      composerEditor.focus();
      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        async () => {
          expect((await waitForInteractionModeButton("Plan")).title).toContain(
            "return to normal chat mode",
          );
        },
        { timeout: 8_000, interval: 16 },
      );

      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        async () => {
          expect((await waitForInteractionModeButton("Chat")).title).toContain("enter plan mode");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });
});
