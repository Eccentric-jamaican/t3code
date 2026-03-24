import { ThreadId, type RuntimeMode } from "@t3tools/contracts";
import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import IntegratedBrowserPane from "../components/IntegratedBrowserPane";
import ThreadSidebar from "../components/Sidebar";
import { useComposerDraftStore } from "../composerDraftStore";
import { isElectron } from "../env";
import { useStore } from "../store";
import { Sidebar, SidebarDesktopBrandTrigger, SidebarProvider } from "~/components/ui/sidebar";

function ChatRouteLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeThreadId =
    pathname.startsWith("/") &&
    !pathname.startsWith("/settings") &&
    !pathname.startsWith("/orchestrate") &&
    pathname.split("/").filter(Boolean).length === 1
      ? ThreadId.makeUnsafe(pathname.slice(1))
      : null;
  const activeThread = useStore((state) =>
    routeThreadId ? state.threads.find((thread) => thread.id === routeThreadId) ?? null : null,
  );
  const activeDraftThread = useComposerDraftStore((state) =>
    routeThreadId ? state.draftThreadsByThreadId[routeThreadId] ?? null : null,
  );
  const activeProjectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? null;
  const activeRuntimeMode: RuntimeMode | null =
    activeThread?.runtimeMode ?? activeDraftThread?.runtimeMode ?? null;

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "open-settings") return;
      void navigate({ to: "/settings" });
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="bg-[var(--app-sidebar-surface)] text-foreground"
      >
        <ThreadSidebar />
      </Sidebar>
      <div
        className="fixed top-0 left-0 z-30 hidden h-[var(--desktop-leading-slot-width)] w-[var(--desktop-leading-slot-width)] items-center justify-center md:flex"
        data-testid="desktop-leading-slot"
      >
        <div
          className={isElectron ? "drag-region flex h-full w-full items-center justify-center" : "flex h-full w-full items-center justify-center"}
        >
          <SidebarDesktopBrandTrigger className={isElectron ? "[-webkit-app-region:no-drag]" : undefined} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--app-workspace-canvas)]">
        <DiffWorkerPoolProvider>
          <Outlet />
        </DiffWorkerPoolProvider>
        <IntegratedBrowserPane
          activeProjectId={activeProjectId}
          activeThreadId={routeThreadId}
          activeRuntimeMode={activeRuntimeMode}
        />
      </div>
    </SidebarProvider>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
