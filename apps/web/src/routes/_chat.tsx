import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { type CSSProperties, useEffect } from "react";

import DesktopShellTitlebarBand from "../components/DesktopShellTitlebarBand";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import ThreadSidebar from "../components/Sidebar";
import { Sidebar, SidebarProvider } from "~/components/ui/sidebar";

function ChatRouteLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isThreadRoute =
    pathname.startsWith("/") &&
    !pathname.startsWith("/settings") &&
    !pathname.startsWith("/orchestrate") &&
    pathname.split("/").filter(Boolean).length === 1;
  const hasDesktopShellChrome =
    typeof window !== "undefined" &&
    (window.desktopBridge !== undefined || window.nativeApi !== undefined);

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
    <SidebarProvider
      defaultOpen
      style={
        {
          "--app-desktop-main-surface": isThreadRoute
            ? "var(--app-thread-surface)"
            : "var(--app-page-shell-surface)",
        } as CSSProperties
      }
    >
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="bg-[var(--app-sidebar-surface)] text-foreground"
      >
        <ThreadSidebar />
      </Sidebar>
      <DesktopShellTitlebarBand hasDesktopShellChrome={hasDesktopShellChrome} />
      <div
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--app-desktop-main-surface)]"
        style={{ paddingTop: "var(--desktop-native-titlebar-height, 0px)" }}
      >
        <DiffWorkerPoolProvider>
          <Outlet />
        </DiffWorkerPoolProvider>
      </div>
    </SidebarProvider>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
