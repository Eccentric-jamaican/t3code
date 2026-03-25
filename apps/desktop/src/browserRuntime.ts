import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import * as Path from "node:path";

import type {
  BrowserInspectCapture,
  BrowserNavigationState,
  BrowserPaneBounds,
  BrowserRuntimeEvent,
  BrowserSessionSnapshot,
  BrowserSessionSummary,
  ProjectId,
} from "@t3tools/contracts";
import { BrowserWindow, WebContentsView } from "electron";

const INSPECT_OVERLAY_ID = "__t3_browser_inspect_overlay";
const INSPECT_SCRIPT = String.raw`
(() => {
  const host = window.__t3BrowserHost;
  if (!host || typeof host.inspectSelectionChanged !== "function") {
    return false;
  }
  if (typeof window.__t3BrowserInspectCleanup === "function") {
    window.__t3BrowserInspectCleanup();
  }

  let hovered = null;
  const overlay = document.createElement("div");
  overlay.id = ${JSON.stringify(INSPECT_OVERLAY_ID)};
  overlay.style.position = "fixed";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "2147483647";
  overlay.style.border = "2px solid rgba(59, 130, 246, 0.95)";
  overlay.style.background = "rgba(59, 130, 246, 0.14)";
  overlay.style.borderRadius = "4px";
  overlay.style.boxSizing = "border-box";
  overlay.style.display = "none";
  document.documentElement.appendChild(overlay);

  const currentSelection = window.__t3BrowserSelectedElement instanceof Element
    ? window.__t3BrowserSelectedElement
    : null;

  const updateOverlay = (target) => {
    if (!(target instanceof Element)) {
      overlay.style.display = "none";
      return;
    }
    const rect = target.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
  };

  if (currentSelection) {
    updateOverlay(currentSelection);
    host.inspectSelectionChanged(true);
  } else {
    host.inspectSelectionChanged(false);
  }

  const resolveTarget = (event) => event.target instanceof Element ? event.target : null;

  const onMouseMove = (event) => {
    if (window.__t3BrowserSelectedElement instanceof Element) {
      updateOverlay(window.__t3BrowserSelectedElement);
      return;
    }
    hovered = resolveTarget(event);
    updateOverlay(hovered);
  };

  const onClick = (event) => {
    const target = resolveTarget(event);
    if (!target) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    window.__t3BrowserSelectedElement = target;
    updateOverlay(target);
    host.inspectSelectionChanged(true);
  };

  const onKeyDown = (event) => {
    if (event.key !== "Escape") {
      return;
    }
    delete window.__t3BrowserSelectedElement;
    hovered = null;
    updateOverlay(null);
    host.inspectSelectionChanged(false);
  };

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  window.__t3BrowserInspectCleanup = () => {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
  };

  return true;
})()
`;

const DISABLE_INSPECT_SCRIPT = String.raw`
(() => {
  if (typeof window.__t3BrowserInspectCleanup === "function") {
    window.__t3BrowserInspectCleanup();
    delete window.__t3BrowserInspectCleanup;
  }
  return window.__t3BrowserSelectedElement instanceof Element;
})()
`;

const CLEAR_SELECTION_SCRIPT = String.raw`
(() => {
  delete window.__t3BrowserSelectedElement;
  return true;
})()
`;

const CAPTURE_SELECTION_SCRIPT = String.raw`
(() => {
  const element = window.__t3BrowserSelectedElement instanceof Element
    ? window.__t3BrowserSelectedElement
    : null;
  if (!element) {
    return null;
  }

  const toSelector = (target) => {
    const parts = [];
    let current = target;
    while (current instanceof Element && parts.length < 6) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += "#" + current.id.replace(/[^a-zA-Z0-9_-]+/g, "");
        parts.unshift(part);
        break;
      }
      if (current.classList.length > 0) {
        part += "." + Array.from(current.classList).slice(0, 2).join(".");
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (candidate) => candidate.tagName === current.tagName,
        );
        if (siblings.length > 1) {
          part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  };

  const toDescriptor = (target) => {
    let value = target.tagName.toLowerCase();
    if (target.id) {
      value += "#" + target.id;
    }
    if (target.classList.length > 0) {
      value += "." + Array.from(target.classList).slice(0, 2).join(".");
    }
    return value;
  };

  const rect = element.getBoundingClientRect();
  const computed = getComputedStyle(element);
  const textSummary = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
  const accessibilityParts = [
    element.getAttribute("aria-label"),
    element.getAttribute("role"),
    element.getAttribute("name"),
    element.getAttribute("alt"),
    element.getAttribute("title"),
  ].filter((value) => typeof value === "string" && value.trim().length > 0);
  const ancestry = [];
  let current = element;
  while (current instanceof Element && ancestry.length < 6) {
    ancestry.unshift(toDescriptor(current));
    current = current.parentElement;
  }

  const sourceUrl = element instanceof HTMLImageElement
    ? element.currentSrc || element.src || null
    : element instanceof HTMLAnchorElement
      ? element.href || null
      : null;

  return {
    url: window.location.href,
    tagName: element.tagName.toLowerCase(),
    selector: toSelector(element),
    ancestry,
    textSummary,
    accessibilitySummary: accessibilityParts.join(" | "),
    sourceUrl,
    sourceLocation: null,
    boundingBox: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    computedStyle: {
      display: computed.display,
      position: computed.position,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      padding: computed.padding,
      margin: computed.margin,
      border: computed.border,
      borderRadius: computed.borderRadius,
    },
  };
})()
`;

const MAX_TEXT_LENGTH = 20_000;
const WAIT_POLL_INTERVAL_MS = 100;
const ATTACHED_BOUNDS_REAPPLY_DELAYS_MS = [0, 75, 200, 500] as const;
const INTEGRATED_BROWSER_VIEWPORT_SELECTOR = '[data-integrated-browser-native-viewport="true"]';

interface BrowserRuntimeRecord {
  projectId: ProjectId;
  sessionId: string;
  view: Electron.WebContentsView;
  createdAt: string;
  updatedAt: string;
  inspectMode: boolean;
  hasSelection: boolean;
  navigation: BrowserNavigationState;
}

function isNavigationAbortError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ERR_ABORTED") || message.includes("ERR_FAILED");
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeBounds(bounds: BrowserPaneBounds): BrowserPaneBounds {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  };
}

async function readIntegratedBrowserViewportBounds(
  window: BrowserWindow | null,
): Promise<BrowserPaneBounds | null> {
  if (!window) {
    return null;
  }

  try {
    const result = await window.webContents.executeJavaScript(
      `(() => {
        const element = document.querySelector(${JSON.stringify(INTEGRATED_BROWSER_VIEWPORT_SELECTOR)});
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) {
          return null;
        }

        return {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
      })()`,
      true,
    );

    if (
      !result ||
      typeof result !== "object" ||
      !("x" in result) ||
      !("y" in result) ||
      !("width" in result) ||
      !("height" in result)
    ) {
      return null;
    }

    const candidate = result as Record<string, unknown>;
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if (![x, y, width, height].every(Number.isFinite)) {
      return null;
    }

    return normalizeBounds({ x, y, width, height });
  } catch {
    return null;
  }
}

function toSummary(runtime: BrowserRuntimeRecord): BrowserSessionSummary {
  return {
    sessionId: runtime.sessionId,
    projectId: runtime.projectId,
    inspectMode: runtime.inspectMode,
    hasSelection: runtime.hasSelection,
    navigation: runtime.navigation,
    createdAt: runtime.createdAt,
    updatedAt: runtime.updatedAt,
  };
}

function captureRectForSelection(input: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Electron.Rectangle {
  const width = Math.max(1, Math.ceil(input.width));
  const height = Math.max(1, Math.ceil(input.height));
  return {
    x: Math.max(0, Math.floor(input.x)),
    y: Math.max(0, Math.floor(input.y)),
    width,
    height,
  };
}

async function capturePngDataUrl(
  webContents: Electron.WebContents,
  rect: Electron.Rectangle,
): Promise<string> {
  const image = await webContents.capturePage(rect);
  return `data:image/png;base64,${image.toPNG().toString("base64")}`;
}

async function evaluateSelectorTarget<T>(
  webContents: Electron.WebContents,
  selector: string,
  body: string,
): Promise<T> {
  const encodedSelector = JSON.stringify(selector);
  return webContents.executeJavaScript(
    `(async () => {
      const element = document.querySelector(${encodedSelector});
      if (!(element instanceof Element)) {
        throw new Error("Target element not found.");
      }
      ${body}
    })()`,
    true,
  ) as Promise<T>;
}

export interface BrowserRuntimeRegistryOptions {
  browserPreloadPath: string;
}

export class BrowserRuntimeRegistry extends EventEmitter<{
  event: [BrowserRuntimeEvent];
}> {
  private readonly runtimes = new Map<ProjectId, BrowserRuntimeRecord>();
  private readonly browserPreloadPath: string;
  private window: BrowserWindow | null = null;
  private attachedProjectId: ProjectId | null = null;
  private paneOpen = false;
  private paneProjectId: ProjectId | null = null;
  private paneBounds: BrowserPaneBounds | null = null;
  private paneRequestVersion = 0;

  constructor(options: BrowserRuntimeRegistryOptions) {
    super();
    this.browserPreloadPath = options.browserPreloadPath;
  }

  setWindow(window: BrowserWindow | null): void {
    if (this.window === window) {
      return;
    }
    if (this.window && this.attachedProjectId) {
      this.detachAttachedView(this.window);
    }
    this.window = window;
    if (window && this.paneOpen && this.paneProjectId && this.paneBounds) {
      this.attachProject(window, this.paneProjectId, this.paneBounds);
    }
  }

  handlePageEvent(projectId: ProjectId, payload: { type: string; hasSelection?: unknown }): void {
    const runtime = this.runtimes.get(projectId);
    if (!runtime) {
      return;
    }
    if (payload.type !== "inspect-selection-changed") {
      return;
    }
    runtime.hasSelection = payload.hasSelection === true;
    runtime.updatedAt = nowIso();
    this.emitStateUpdated(projectId);
    this.emit("event", {
      type: "inspect.selection.changed",
      projectId,
      hasSelection: runtime.hasSelection,
    });
  }

  findProjectIdByWebContentsId(webContentsId: number): ProjectId | null {
    for (const runtime of this.runtimes.values()) {
      if (runtime.view.webContents.id === webContentsId) {
        return runtime.projectId;
      }
    }
    return null;
  }

  async getState(projectId: ProjectId): Promise<BrowserSessionSnapshot> {
    return this.snapshotForProject(projectId);
  }

  async open(projectId: ProjectId, bounds: BrowserPaneBounds): Promise<BrowserSessionSnapshot> {
    const requestVersion = ++this.paneRequestVersion;
    this.paneOpen = true;
    this.paneProjectId = projectId;
    this.paneBounds = normalizeBounds(bounds);
    await this.ensureRuntime(projectId);
    if (
      requestVersion !== this.paneRequestVersion ||
      !this.paneOpen ||
      this.paneProjectId !== projectId ||
      !this.paneBounds
    ) {
      return this.snapshotForProject(projectId);
    }
    const measuredBounds = await readIntegratedBrowserViewportBounds(this.window);
    if (
      requestVersion !== this.paneRequestVersion ||
      !this.paneOpen ||
      this.paneProjectId !== projectId ||
      !this.paneBounds
    ) {
      return this.snapshotForProject(projectId);
    }
    if (measuredBounds) {
      this.paneBounds = measuredBounds;
    }
    if (this.window) {
      this.attachProject(this.window, projectId, this.paneBounds);
    }
    this.emitStateUpdated(projectId);
    return this.snapshotForProject(projectId);
  }

  async closePane(): Promise<void> {
    this.paneRequestVersion += 1;
    this.paneOpen = false;
    this.paneBounds = null;
    if (this.window) {
      this.detachAttachedView(this.window);
    }
    if (this.paneProjectId) {
      this.emitStateUpdated(this.paneProjectId);
    }
    this.paneProjectId = null;
  }

  async requestPane(projectId: ProjectId): Promise<void> {
    this.emit("event", {
      type: "pane.requested",
      projectId,
    });
  }

  async navigate(projectId: ProjectId, url: string): Promise<BrowserSessionSnapshot> {
    const runtime = await this.ensureRuntime(projectId);
    const targetUrl = this.normalizeUrl(url);
    await this.loadUrl(runtime, targetUrl);
    runtime.navigation = {
      ...runtime.navigation,
      url: targetUrl,
      lastCommittedAt: nowIso(),
    };
    runtime.updatedAt = nowIso();
    this.emitStateUpdated(projectId);
    return this.snapshotForProject(projectId);
  }

  async back(projectId: ProjectId): Promise<BrowserSessionSnapshot> {
    const runtime = await this.ensureRuntime(projectId);
    if (runtime.view.webContents.navigationHistory.canGoBack()) {
      runtime.view.webContents.navigationHistory.goBack();
    }
    return this.snapshotForProject(projectId);
  }

  async forward(projectId: ProjectId): Promise<BrowserSessionSnapshot> {
    const runtime = await this.ensureRuntime(projectId);
    if (runtime.view.webContents.navigationHistory.canGoForward()) {
      runtime.view.webContents.navigationHistory.goForward();
    }
    return this.snapshotForProject(projectId);
  }

  async reload(projectId: ProjectId): Promise<BrowserSessionSnapshot> {
    const runtime = await this.ensureRuntime(projectId);
    runtime.view.webContents.reload();
    return this.snapshotForProject(projectId);
  }

  async kill(projectId: ProjectId): Promise<void> {
    const runtime = this.runtimes.get(projectId);
    if (!runtime) {
      return;
    }
    if (this.window && this.attachedProjectId === projectId) {
      this.detachAttachedView(this.window);
    }
    this.runtimes.delete(projectId);
    runtime.view.webContents.close({ waitForBeforeUnload: false });
    if (this.paneProjectId === projectId) {
      this.paneProjectId = null;
      this.paneOpen = false;
      this.paneBounds = null;
    }
  }

  async setInspectMode(projectId: ProjectId, enabled: boolean): Promise<BrowserSessionSnapshot> {
    const runtime = await this.ensureRuntime(projectId);
    runtime.inspectMode = enabled;
    runtime.updatedAt = nowIso();
    if (enabled) {
      await runtime.view.webContents.executeJavaScript(INSPECT_SCRIPT, true);
    } else {
      runtime.hasSelection = await runtime.view.webContents.executeJavaScript(
        DISABLE_INSPECT_SCRIPT,
        true,
      );
    }
    this.emitStateUpdated(projectId);
    return this.snapshotForProject(projectId);
  }

  async captureInspectSelection(projectId: ProjectId): Promise<BrowserInspectCapture | null> {
    const runtime = this.runtimes.get(projectId);
    if (!runtime) {
      return null;
    }
    const selection = (await runtime.view.webContents.executeJavaScript(
      CAPTURE_SELECTION_SCRIPT,
      true,
    )) as
      | (Omit<BrowserInspectCapture, "sessionId" | "projectId" | "screenshotDataUrl" | "capturedAt"> & {
          boundingBox: BrowserInspectCapture["boundingBox"];
        })
      | null;
    if (!selection) {
      return null;
    }

    const screenshotDataUrl = await capturePngDataUrl(
      runtime.view.webContents,
      captureRectForSelection(selection.boundingBox),
    );

    await runtime.view.webContents.executeJavaScript(CLEAR_SELECTION_SCRIPT, true);
    runtime.hasSelection = false;
    runtime.inspectMode = false;
    runtime.updatedAt = nowIso();
    await runtime.view.webContents.executeJavaScript(DISABLE_INSPECT_SCRIPT, true);
    this.emitStateUpdated(projectId);

    return {
      sessionId: runtime.sessionId,
      projectId,
      url: selection.url,
      tagName: selection.tagName,
      selector: selection.selector,
      ancestry: selection.ancestry,
      textSummary: selection.textSummary,
      accessibilitySummary: selection.accessibilitySummary,
      sourceUrl: selection.sourceUrl,
      sourceLocation: selection.sourceLocation,
      boundingBox: selection.boundingBox,
      computedStyle: selection.computedStyle,
      screenshotDataUrl,
      capturedAt: nowIso(),
    };
  }

  async ensure(projectId: ProjectId): Promise<BrowserSessionSnapshot> {
    await this.ensureRuntime(projectId);
    return this.snapshotForProject(projectId);
  }

  async snapshot(projectId: ProjectId): Promise<Record<string, unknown>> {
    const runtime = await this.ensureRuntime(projectId);
    const result = await runtime.view.webContents.executeJavaScript(
      `(() => ({
        url: window.location.href,
        title: document.title,
        text: (document.body?.innerText ?? "").slice(0, ${MAX_TEXT_LENGTH}),
        html: document.documentElement?.outerHTML?.slice(0, ${MAX_TEXT_LENGTH}) ?? "",
      }))()`,
      true,
    );
    return result as Record<string, unknown>;
  }

  async screenshot(projectId: ProjectId): Promise<string> {
    const runtime = await this.ensureRuntime(projectId);
    const bounds = runtime.view.getBounds();
    return capturePngDataUrl(runtime.view.webContents, {
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });
  }

  async waitFor(projectId: ProjectId, input: { selector?: string; text?: string; timeoutMs?: number }) {
    const runtime = await this.ensureRuntime(projectId);
    const timeoutMs = Math.max(100, Math.min(input.timeoutMs ?? 10_000, 60_000));
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const matched = await runtime.view.webContents.executeJavaScript(
        `(async () => {
          const selector = ${JSON.stringify(input.selector ?? "")};
          const text = ${JSON.stringify(input.text ?? "")};
          if (selector.length > 0 && document.querySelector(selector)) {
            return true;
          }
          if (text.length > 0 && document.body && document.body.innerText.includes(text)) {
            return true;
          }
          return false;
        })()`,
        true,
      );
      if (matched === true) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
    }
    throw new Error("Timed out waiting for browser condition.");
  }

  async click(projectId: ProjectId, selector: string): Promise<void> {
    const runtime = await this.ensureRuntime(projectId);
    await evaluateSelectorTarget<void>(
      runtime.view.webContents,
      selector,
      `
      element.scrollIntoView({ block: "center", inline: "center" });
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      element.click();
      `,
    );
  }

  async hover(projectId: ProjectId, selector: string): Promise<void> {
    const runtime = await this.ensureRuntime(projectId);
    await evaluateSelectorTarget<void>(
      runtime.view.webContents,
      selector,
      `
      element.scrollIntoView({ block: "center", inline: "center" });
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      `,
    );
  }

  async fill(projectId: ProjectId, input: { selector: string; value: string }): Promise<void> {
    const runtime = await this.ensureRuntime(projectId);
    await evaluateSelectorTarget<void>(
      runtime.view.webContents,
      input.selector,
      `
      if (!("value" in element)) {
        throw new Error("Target element does not support value assignment.");
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      element.focus();
      element.value = ${JSON.stringify(input.value)};
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      `,
    );
  }

  async typeText(projectId: ProjectId, input: { selector: string; text: string }): Promise<void> {
    const runtime = await this.ensureRuntime(projectId);
    await evaluateSelectorTarget<void>(
      runtime.view.webContents,
      input.selector,
      `
      if (!("value" in element)) {
        throw new Error("Target element does not support text input.");
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      element.focus();
      element.value = (String(element.value ?? "") + ${JSON.stringify(input.text)});
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      `,
    );
  }

  async pressKey(projectId: ProjectId, key: string): Promise<void> {
    const runtime = await this.ensureRuntime(projectId);
    runtime.view.webContents.sendInputEvent({ type: "keyDown", keyCode: key });
    runtime.view.webContents.sendInputEvent({ type: "char", keyCode: key });
    runtime.view.webContents.sendInputEvent({ type: "keyUp", keyCode: key });
  }

  async evaluate(projectId: ProjectId, expression: string): Promise<unknown> {
    const runtime = await this.ensureRuntime(projectId);
    return runtime.view.webContents.executeJavaScript(
      `(async () => {
        return await (0, eval)(${JSON.stringify(expression)});
      })()`,
      true,
    );
  }

  private async ensureRuntime(projectId: ProjectId): Promise<BrowserRuntimeRecord> {
    const existing = this.runtimes.get(projectId);
    if (existing) {
      return existing;
    }

    const partition = `t3-browser-${String(projectId)}`;
    const preloadPath = Path.resolve(this.browserPreloadPath);
    const view = new WebContentsView({
      webPreferences: {
        partition,
        preload: preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const createdAt = nowIso();
    const runtime: BrowserRuntimeRecord = {
      projectId,
      sessionId: randomUUID(),
      view,
      createdAt,
      updatedAt: createdAt,
      inspectMode: false,
      hasSelection: false,
      navigation: {
        url: null,
        title: null,
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        lastCommittedAt: null,
      },
    };
    this.installListeners(runtime);
    this.runtimes.set(projectId, runtime);
    await view.webContents.loadURL("about:blank");
    return runtime;
  }

  private installListeners(runtime: BrowserRuntimeRecord): void {
    const syncNavigation = () => {
      runtime.navigation = {
        url: runtime.view.webContents.getURL() || null,
        title: runtime.view.webContents.getTitle() || null,
        canGoBack: runtime.view.webContents.navigationHistory.canGoBack(),
        canGoForward: runtime.view.webContents.navigationHistory.canGoForward(),
        isLoading: runtime.view.webContents.isLoading(),
        lastCommittedAt: nowIso(),
      };
      runtime.updatedAt = nowIso();
      this.emitStateUpdated(runtime.projectId);
    };

    runtime.view.webContents.on("did-navigate", syncNavigation);
    runtime.view.webContents.on("did-navigate-in-page", syncNavigation);
    runtime.view.webContents.on("page-title-updated", syncNavigation);
    runtime.view.webContents.on("did-start-loading", syncNavigation);
    runtime.view.webContents.on("did-stop-loading", syncNavigation);
    runtime.view.webContents.on("dom-ready", () => {
      this.scheduleAttachedBoundsReapply(runtime.projectId);
    });
    runtime.view.webContents.on("did-finish-load", () => {
      this.scheduleAttachedBoundsReapply(runtime.projectId);
    });
    runtime.view.webContents.on("did-stop-loading", () => {
      this.scheduleAttachedBoundsReapply(runtime.projectId);
    });
    runtime.view.webContents.on("render-process-gone", () => {
      runtime.updatedAt = nowIso();
      this.emitStateUpdated(runtime.projectId);
    });
  }

  private emitStateUpdated(projectId: ProjectId): void {
    this.emit("event", {
      type: "state.updated",
      projectId,
      snapshot: this.snapshotForProject(projectId),
    });
  }

  private snapshotForProject(projectId: ProjectId): BrowserSessionSnapshot {
    const runtime = this.runtimes.get(projectId);
    return {
      paneOpen: this.paneOpen,
      paneProjectId: this.paneProjectId,
      paneBounds: this.paneBounds,
      session: runtime ? toSummary(runtime) : null,
    };
  }

  private async loadUrl(runtime: BrowserRuntimeRecord, url: string): Promise<void> {
    try {
      await runtime.view.webContents.loadURL(url);
    } catch (error) {
      const committedUrl = runtime.view.webContents.getURL();
      if (
        isNavigationAbortError(error) &&
        committedUrl.length > 0 &&
        committedUrl !== "about:blank"
      ) {
        return;
      }
      throw error;
    }
  }

  private applyBounds(
    runtime: BrowserRuntimeRecord,
    bounds: BrowserPaneBounds,
    options: { forceViewportRefresh?: boolean } = {},
  ): void {
    const nextBounds = normalizeBounds(bounds);
    const shouldShow = nextBounds.width > 0 && nextBounds.height > 0;

    if (options.forceViewportRefresh && shouldShow) {
      const nudgedBounds = { ...nextBounds };
      if (nudgedBounds.width > 1) {
        nudgedBounds.width -= 1;
      } else if (nudgedBounds.height > 1) {
        nudgedBounds.height -= 1;
      }
      if (
        nudgedBounds.width !== nextBounds.width ||
        nudgedBounds.height !== nextBounds.height
      ) {
        runtime.view.setBounds(nudgedBounds);
      }
    }

    runtime.view.setBounds(nextBounds);
    runtime.view.setVisible(shouldShow);
    void runtime.view.webContents
      .executeJavaScript(
        `window.dispatchEvent(new Event("resize")); window.visualViewport?.dispatchEvent?.(new Event("resize"));`,
        true,
      )
      .catch(() => undefined);
  }

  private attachProject(window: BrowserWindow, projectId: ProjectId, bounds: BrowserPaneBounds): void {
    const runtime = this.runtimes.get(projectId);
    if (!runtime) {
      return;
    }
    const contentView = (window as BrowserWindow & {
      contentView: { addChildView: (view: Electron.WebContentsView) => void; removeChildView: (view: Electron.WebContentsView) => void };
    }).contentView;

    if (this.attachedProjectId && this.attachedProjectId !== projectId) {
      const attached = this.runtimes.get(this.attachedProjectId);
      if (attached) {
        contentView.removeChildView(attached.view);
      }
    }
    if (this.attachedProjectId !== projectId) {
      contentView.addChildView(runtime.view);
    }
    this.applyBounds(runtime, bounds, { forceViewportRefresh: true });
    this.attachedProjectId = projectId;
    this.scheduleAttachedBoundsReapply(projectId);
  }

  private scheduleAttachedBoundsReapply(projectId: ProjectId): void {
    for (const delayMs of ATTACHED_BOUNDS_REAPPLY_DELAYS_MS) {
      globalThis.setTimeout(() => {
        void this.reapplyAttachedBounds(projectId);
      }, delayMs);
    }
  }

  private async reapplyAttachedBounds(projectId: ProjectId): Promise<void> {
    const requestVersion = this.paneRequestVersion;
    if (
      !this.window ||
      !this.paneOpen ||
      !this.paneBounds ||
      this.paneProjectId !== projectId ||
      this.attachedProjectId !== projectId
    ) {
      return;
    }
    const runtime = this.runtimes.get(projectId);
    if (!runtime) {
      return;
    }
    const measuredBounds = await readIntegratedBrowserViewportBounds(this.window);
    if (
      requestVersion !== this.paneRequestVersion ||
      !this.window ||
      !this.paneOpen ||
      !this.paneBounds ||
      this.paneProjectId !== projectId ||
      this.attachedProjectId !== projectId
    ) {
      return;
    }
    if (measuredBounds) {
      this.paneBounds = measuredBounds;
    }
    this.applyBounds(runtime, this.paneBounds, { forceViewportRefresh: true });
  }

  private detachAttachedView(window: BrowserWindow): void {
    if (!this.attachedProjectId) {
      return;
    }
    const runtime = this.runtimes.get(this.attachedProjectId);
    if (!runtime) {
      this.attachedProjectId = null;
      return;
    }
    const contentView = (window as BrowserWindow & {
      contentView: { removeChildView: (view: Electron.WebContentsView) => void };
    }).contentView;
    contentView.removeChildView(runtime.view);
    this.attachedProjectId = null;
  }

  private normalizeUrl(value: string): string {
    const trimmed = value.trim();
    if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }
}
