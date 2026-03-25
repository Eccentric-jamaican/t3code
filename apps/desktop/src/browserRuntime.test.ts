import { ProjectId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

declare global {
  var __browserRuntimeTestLog: string[] | undefined;
}

vi.mock("electron", () => {
  class TinyEmitter {
    private readonly listeners = new Map<string, Array<(...args: Array<unknown>) => void>>();

    on(event: string, listener: (...args: Array<unknown>) => void) {
      const next = this.listeners.get(event) ?? [];
      next.push(listener);
      this.listeners.set(event, next);
      return this;
    }

    emit(event: string, ...args: Array<unknown>) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    }
  }

  class MockWebContents extends TinyEmitter {
    id = Math.floor(Math.random() * 100_000);
    currentUrl = "";
    title = "";
    loading = false;
    zoomFactor = 1;
    setZoomFactorCalls: number[] = [];
    ownerView: MockWebContentsView | null = null;
    readonly navigationHistory = {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: () => undefined,
      goForward: () => undefined,
    };

    async loadURL(url: string): Promise<void> {
      this.loading = true;
      this.currentUrl = url;
      this.emit("did-start-loading");
      this.emit("did-navigate");
      this.loading = false;
      this.emit("dom-ready");
      this.emit("did-finish-load");
      this.emit("did-stop-loading");
    }

    getURL(): string {
      return this.currentUrl;
    }

    getTitle(): string {
      return this.title;
    }

    isLoading(): boolean {
      return this.loading;
    }

    async executeJavaScript(): Promise<unknown> {
      return null;
    }

    async capturePage() {
      return {
        toPNG: () => Buffer.from(""),
      };
    }

    reload(): void {}

    close(): void {}

    sendInputEvent(): void {}

    getZoomFactor(): number {
      return this.zoomFactor;
    }

    setZoomFactor(factor: number): void {
      this.zoomFactor = factor;
      this.setZoomFactorCalls.push(factor);
    }
  }

  class MockWebContentsView {
    readonly webContents = new MockWebContents();
    readonly setBoundsCalls: Array<{ x: number; y: number; width: number; height: number }> = [];
    readonly setVisibleCalls: boolean[] = [];
    private bounds = { x: 0, y: 0, width: 0, height: 0 };

    constructor() {
      this.webContents.ownerView = this;
    }

    setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
      globalThis.__browserRuntimeTestLog?.push("setBounds");
      this.bounds = { ...bounds };
      this.setBoundsCalls.push({ ...bounds });
    }

    getBounds() {
      return this.bounds;
    }

    setVisible(visible: boolean): void {
      this.setVisibleCalls.push(visible);
    }
  }

  return {
    BrowserWindow: undefined,
    WebContentsView: MockWebContentsView,
  };
});

import { BrowserRuntimeRegistry } from "./browserRuntime";

describe("BrowserRuntimeRegistry", () => {
  beforeEach(() => {
    globalThis.__browserRuntimeTestLog = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    globalThis.__browserRuntimeTestLog = undefined;
  });

  it("suppresses abort-style navigation errors after a non-blank page commits", async () => {
    const registry = new BrowserRuntimeRegistry({ browserPreloadPath: "test-preload.js" });
    const projectId = ProjectId.makeUnsafe("project-1");

    await registry.ensure(projectId);
    const runtime = ((registry as any).runtimes as Map<
      ProjectId,
      { view: { webContents: { currentUrl: string; loadURL: (url: string) => Promise<void> } } }
    >).get(projectId);

    expect(runtime).toBeDefined();
    runtime!.view.webContents.loadURL = async () => {
      runtime!.view.webContents.currentUrl = "https://www.google.com/";
      throw new Error("ERR_ABORTED");
    };

    await expect(registry.navigate(projectId, "google.com")).resolves.toMatchObject({
      session: expect.objectContaining({
        navigation: expect.objectContaining({
          url: "https://google.com",
        }),
      }),
    });
  });

  it("still throws abort-style navigation errors when nothing committed", async () => {
    const registry = new BrowserRuntimeRegistry({ browserPreloadPath: "test-preload.js" });
    const projectId = ProjectId.makeUnsafe("project-2");

    await registry.ensure(projectId);
    const runtime = ((registry as any).runtimes as Map<
      ProjectId,
      { view: { webContents: { currentUrl: string; loadURL: (url: string) => Promise<void> } } }
    >).get(projectId);

    expect(runtime).toBeDefined();
    runtime!.view.webContents.loadURL = async () => {
      runtime!.view.webContents.currentUrl = "about:blank";
      throw new Error("ERR_ABORTED");
    };

    await expect(registry.navigate(projectId, "https://example.com")).rejects.toThrow("ERR_ABORTED");
  });

  it("attaches the native view before applying pane bounds", async () => {
    const registry = new BrowserRuntimeRegistry({ browserPreloadPath: "test-preload.js" });
    const addChildView = vi.fn((view: unknown) => {
      globalThis.__browserRuntimeTestLog?.push("addChildView");
      return view;
    });
    const window = {
      contentView: {
        addChildView,
        removeChildView: vi.fn(),
      },
    };
    const projectId = ProjectId.makeUnsafe("project-3");

    registry.setWindow(window as never);
    await registry.open(projectId, { x: 10, y: 20, width: 320, height: 240 });
    vi.runAllTimers();

    const runtime = ((registry as any).runtimes as Map<
      ProjectId,
      {
        view: {
          setBoundsCalls: Array<{ x: number; y: number; width: number; height: number }>;
          setVisibleCalls: boolean[];
        };
      }
    >).get(projectId);

    expect(runtime).toBeDefined();
    expect(addChildView).toHaveBeenCalledWith(runtime!.view);
    expect(globalThis.__browserRuntimeTestLog?.indexOf("addChildView")).toBeLessThan(
      globalThis.__browserRuntimeTestLog?.indexOf("setBounds") ?? Number.POSITIVE_INFINITY,
    );
    expect(runtime!.view.setBoundsCalls.at(-1)).toEqual({
      x: 10,
      y: 20,
      width: 320,
      height: 240,
    });
    expect(runtime!.view.setVisibleCalls.at(-1)).toBe(true);
  });

  it("updates pane state when reopening with new bounds", async () => {
    const registry = new BrowserRuntimeRegistry({ browserPreloadPath: "test-preload.js" });
    const window = {
      contentView: {
        addChildView: vi.fn(),
        removeChildView: vi.fn(),
      },
    };
    const projectId = ProjectId.makeUnsafe("project-4");

    registry.setWindow(window as never);
    await registry.open(projectId, { x: 10, y: 20, width: 320, height: 240 });
    const snapshot = await registry.open(projectId, { x: 25, y: 35, width: 480, height: 360 });
    vi.runAllTimers();

    const runtime = ((registry as any).runtimes as Map<
      ProjectId,
      {
        view: {
          setBoundsCalls: Array<{ x: number; y: number; width: number; height: number }>;
        };
      }
    >).get(projectId);

    expect(snapshot.paneOpen).toBe(true);
    expect(snapshot.paneProjectId).toBe(projectId);
    expect(snapshot.paneBounds).toEqual({ x: 25, y: 35, width: 480, height: 360 });
    expect(runtime!.view.setBoundsCalls.at(-1)).toEqual({
      x: 25,
      y: 35,
      width: 480,
      height: 360,
    });
  });

  it("detaches the pane without discarding the runtime and reapplies exact bounds on reopen", async () => {
    const registry = new BrowserRuntimeRegistry({ browserPreloadPath: "test-preload.js" });
    const addChildView = vi.fn();
    const removeChildView = vi.fn();
    const window = {
      contentView: {
        addChildView,
        removeChildView,
      },
    };
    const projectId = ProjectId.makeUnsafe("project-5");

    registry.setWindow(window as never);
    await registry.open(projectId, { x: 10, y: 20, width: 420, height: 320 });
    vi.runAllTimers();

    const runtime = ((registry as any).runtimes as Map<
      ProjectId,
      {
        view: {
          setBoundsCalls: Array<{ x: number; y: number; width: number; height: number }>;
          webContents: { setZoomFactorCalls: number[] };
        };
      }
    >).get(projectId);

    expect(runtime).toBeDefined();
    await registry.closePane();
    expect(removeChildView).toHaveBeenCalledWith(runtime!.view);
    expect((registry as any).attachedProjectId).toBeNull();
    expect((registry as any).paneOpen).toBe(false);
    expect((registry as any).paneBounds).toBeNull();
    expect(((registry as any).runtimes as Map<ProjectId, unknown>).has(projectId)).toBe(true);

    const reopened = await registry.open(projectId, { x: 25, y: 35, width: 480, height: 360 });
    vi.runAllTimers();

    expect(reopened.paneOpen).toBe(true);
    expect(reopened.paneProjectId).toBe(projectId);
    expect(reopened.paneBounds).toEqual({ x: 25, y: 35, width: 480, height: 360 });
    expect(addChildView).toHaveBeenCalledTimes(2);
    expect(runtime!.view.setBoundsCalls.at(-1)).toEqual({
      x: 25,
      y: 35,
      width: 480,
      height: 360,
    });
    expect(runtime!.view.webContents.setZoomFactorCalls).toHaveLength(0);
  });
});
