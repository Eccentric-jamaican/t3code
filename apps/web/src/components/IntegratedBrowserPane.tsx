import type {
  BrowserInspectCapture,
  BrowserSessionSnapshot,
  ProjectId,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GlobeIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useBrowserPaneStore } from "~/browserPaneStore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { toastManager } from "~/components/ui/toast";
import { Toggle } from "~/components/ui/toggle";
import { useComposerDraftStore } from "~/composerDraftStore";
import { readNativeApi } from "~/nativeApi";
import { cn } from "~/lib/utils";

function dataUrlToFile(dataUrl: string, name: string): File {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) {
    throw new Error("Invalid screenshot payload.");
  }
  const mimeType = match[1];
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type: mimeType });
}

function buildInspectPrompt(capture: BrowserInspectCapture): string {
  const metadata = {
    selector: capture.selector,
    tagName: capture.tagName,
    url: capture.url,
    ancestry: capture.ancestry,
    textSummary: capture.textSummary,
    accessibilitySummary: capture.accessibilitySummary,
    sourceUrl: capture.sourceUrl,
    sourceLocation: capture.sourceLocation,
    boundingBox: capture.boundingBox,
    computedStyle: capture.computedStyle,
  };
  return [
    "Use this inspected element as the target for the next edit.",
    "",
    "```json",
    JSON.stringify(metadata, null, 2),
    "```",
  ].join("\n");
}

function createImageAttachment(dataUrl: string) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `browser-inspect-${Date.now()}`;
  const name = `${id}.png`;
  const file = dataUrlToFile(dataUrl, name);
  return {
    type: "image" as const,
    id,
    name,
    mimeType: file.type || "image/png",
    sizeBytes: file.size,
    previewUrl: dataUrl,
    file,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

function isBenignBrowserError(error: unknown): boolean {
  return getErrorMessage(error).includes("ERR_ABORTED");
}

interface BrowserPaneProps {
  activeProjectId: ProjectId | null;
  activeThreadId: ThreadId | null;
  activeRuntimeMode: RuntimeMode | null;
}

export default function IntegratedBrowserPane(props: BrowserPaneProps) {
  const { activeProjectId, activeThreadId } = props;
  const open = useBrowserPaneStore((state) => state.open);
  const width = useBrowserPaneStore((state) => state.width);
  const setOpen = useBrowserPaneStore((state) => state.setOpen);
  const setWidth = useBrowserPaneStore((state) => state.setWidth);
  const setPrompt = useComposerDraftStore((state) => state.setPrompt);
  const addImage = useComposerDraftStore((state) => state.addImage);
  const paneRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<BrowserSessionSnapshot | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [isSyncingBounds, setIsSyncingBounds] = useState(false);
  const captureInFlightRef = useRef(false);
  const api = readNativeApi();
  const isDesktopBrowserAvailable =
    api && typeof window !== "undefined" && Boolean(window.desktopBridge?.browser);
  const session = snapshot?.session ?? null;

  const handleBrowserError = useCallback((action: string, error: unknown) => {
    if (isBenignBrowserError(error)) {
      return;
    }
    toastManager.add({
      type: "error",
      title: "Browser action failed",
      description: `${action}: ${getErrorMessage(error)}`,
    });
  }, []);

  const runBrowserAction = useCallback(
    async <T,>(action: string, operation: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await operation();
      } catch (error) {
        handleBrowserError(action, error);
        return undefined;
      }
    },
    [handleBrowserError],
  );

  useEffect(() => {
    if (!api?.browser) {
      return;
    }
    const unsubscribe = api.browser.onEvent((event) => {
      if (event.type === "pane.requested") {
        setOpen(true);
      }
      if (!activeProjectId || event.projectId !== activeProjectId) {
        return;
      }
      if (event.type === "state.updated") {
        setSnapshot(event.snapshot);
        return;
      }
      if (
        event.type === "inspect.selection.changed" &&
        event.hasSelection &&
        activeThreadId &&
        !captureInFlightRef.current
      ) {
        captureInFlightRef.current = true;
        void api.browser
          .captureInspectSelection({ projectId: activeProjectId })
          .then((capture) => {
            if (!capture) {
              return;
            }
            const prompt = buildInspectPrompt(capture);
            const currentPrompt =
              useComposerDraftStore.getState().draftsByThreadId[activeThreadId]?.prompt ?? "";
            const nextPrompt =
              currentPrompt.trim().length > 0 ? `${currentPrompt}\n\n${prompt}` : prompt;
            setPrompt(activeThreadId, nextPrompt);
            addImage(activeThreadId, createImageAttachment(capture.screenshotDataUrl));
          })
          .catch((error) => {
            handleBrowserError("capture inspect selection", error);
          })
          .finally(() => {
            captureInFlightRef.current = false;
          });
      }
    });
    return unsubscribe;
  }, [
    activeProjectId,
    activeThreadId,
    addImage,
    api,
    handleBrowserError,
    setOpen,
    setPrompt,
  ]);

  useEffect(() => {
    if (!api?.browser || !activeProjectId) {
      setSnapshot(null);
      return;
    }
    void api.browser
      .getState({ projectId: activeProjectId })
      .then(setSnapshot)
      .catch(() => {
        setSnapshot(null);
      });
  }, [activeProjectId, api]);

  useEffect(() => {
    const nextUrl = session?.navigation.url ?? "";
    setUrlInput(nextUrl);
  }, [session?.navigation.url]);

  useLayoutEffect(() => {
    if (!open || !api?.browser || !activeProjectId || !viewportRef.current) {
      if (!open) {
        void api?.browser?.closePane().catch(() => undefined);
      }
      return;
    }

    let cancelled = false;
    const syncBounds = async () => {
      if (!viewportRef.current) {
        return;
      }
      const rect = viewportRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      setIsSyncingBounds(true);
      try {
        const nextSnapshot = await runBrowserAction("open browser pane", () =>
          api.browser.open({
            projectId: activeProjectId,
            bounds: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            },
          }),
        );
        if (!cancelled) {
          setSnapshot(nextSnapshot ?? null);
        }
      } finally {
        if (!cancelled) {
          setIsSyncingBounds(false);
        }
      }
    };

    const observer = new ResizeObserver(() => {
      void syncBounds();
    });
    observer.observe(viewportRef.current);
    const frameId = window.requestAnimationFrame(() => {
      void syncBounds();
    });
    window.addEventListener("resize", syncBounds);
    window.addEventListener("scroll", syncBounds, true);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.removeEventListener("scroll", syncBounds, true);
    };
  }, [activeProjectId, api, open, runBrowserAction, width]);

  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!paneRef.current) {
      return;
    }
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      setWidth(startWidth + delta);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const navigate = async () => {
    if (!api?.browser || !activeProjectId || urlInput.trim().length === 0) {
      return;
    }
    const nextSnapshot = await runBrowserAction("navigate browser", () =>
      api.browser.navigate({
        projectId: activeProjectId,
        url: urlInput,
      }),
    );
    if (nextSnapshot) {
      setSnapshot(nextSnapshot);
    }
  };

  const onUrlKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    void navigate();
  };

  const browserOpen = open && isDesktopBrowserAvailable && activeProjectId !== null;
  const controlsDisabled = !browserOpen || !activeProjectId || !api?.browser;

  if (!isDesktopBrowserAvailable || !browserOpen) {
    return null;
  }

  return (
    <aside
      ref={paneRef}
      className="relative flex h-full shrink-0 border-l border-border bg-background"
      style={{ width }}
    >
      <div
        className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize"
        onPointerDown={onResizeStart}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-border px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Back"
            disabled={controlsDisabled || !session?.navigation.canGoBack}
            onClick={() => {
              if (!activeProjectId) {
                return;
              }
              void runBrowserAction("go back", () =>
                api.browser.back({ projectId: activeProjectId }),
              ).then((nextSnapshot) => {
                if (nextSnapshot) {
                  setSnapshot(nextSnapshot);
                }
              });
            }}
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Forward"
            disabled={controlsDisabled || !session?.navigation.canGoForward}
            onClick={() => {
              if (!activeProjectId) {
                return;
              }
              void runBrowserAction("go forward", () =>
                api.browser.forward({ projectId: activeProjectId }),
              ).then((nextSnapshot) => {
                if (nextSnapshot) {
                  setSnapshot(nextSnapshot);
                }
              });
            }}
          >
            <ArrowRightIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Reload"
            disabled={controlsDisabled}
            onClick={() => {
              if (!activeProjectId) {
                return;
              }
              void runBrowserAction("reload page", () =>
                api.browser.reload({ projectId: activeProjectId }),
              ).then((nextSnapshot) => {
                if (nextSnapshot) {
                  setSnapshot(nextSnapshot);
                }
              });
            }}
          >
            <RefreshCwIcon className={cn(session?.navigation.isLoading && "animate-spin")} />
          </Button>
          <Input
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            onKeyDown={onUrlKeyDown}
            className="h-8 min-w-0 flex-1 rounded-md border-border bg-muted/40 text-xs"
            spellCheck={false}
            aria-label="Browser URL"
          />
          <Toggle
            pressed={session?.inspectMode === true}
            onPressedChange={(next) => {
              if (!activeProjectId) {
                return;
              }
              void runBrowserAction("toggle inspect mode", () =>
                api.browser.setInspectMode({ projectId: activeProjectId, enabled: next }),
              ).then((nextSnapshot) => {
                if (nextSnapshot) {
                  setSnapshot(nextSnapshot);
                }
              });
            }}
            variant="outline"
            size="sm"
            aria-label="Inspect element"
            disabled={controlsDisabled}
          >
            <SearchIcon className="size-3.5" />
          </Toggle>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Kill browser"
            disabled={controlsDisabled}
            onClick={() => {
              if (!activeProjectId) {
                return;
              }
              void runBrowserAction("kill browser", () =>
                api.browser.kill({ projectId: activeProjectId }),
              ).then(() => {
                setSnapshot(null);
              });
            }}
          >
            <GlobeIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Collapse browser"
            onClick={() => setOpen(false)}
          >
            <XIcon />
          </Button>
        </div>
        <div className="relative min-h-0 flex-1">
          <div ref={viewportRef} className="absolute inset-0" />
          {(isSyncingBounds || !session) && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-muted-foreground">
              Loading browser...
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
