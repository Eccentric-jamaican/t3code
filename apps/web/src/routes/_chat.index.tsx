import { createFileRoute } from "@tanstack/react-router";

import AppPageShell, {
  useAppPageDesktopLeadingSlotSafeHeaderStyle,
} from "../components/AppPageShell";
import { cn } from "~/lib/utils";
import { isElectron } from "../env";
import { SidebarInsetTrigger } from "../components/ui/sidebar";

function ChatIndexRouteView() {
  const desktopLeadingSlotSafeHeaderStyle = useAppPageDesktopLeadingSlotSafeHeaderStyle();

  return (
    <AppPageShell className="text-muted-foreground/40">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--app-page-shell-surface)] text-muted-foreground/40">
        {!isElectron && (
          <header className="px-3 py-2 md:hidden">
            <div className="flex items-center gap-2">
              <SidebarInsetTrigger className="shrink-0" />
              <span className="text-sm font-medium text-foreground">Threads</span>
            </div>
          </header>
        )}

        {isElectron && (
          <div
            className={cn("drag-region flex h-[52px] shrink-0 items-center gap-2 px-3 sm:px-5")}
            style={desktopLeadingSlotSafeHeaderStyle}
          >
            <span className="text-xs text-muted-foreground/50">No active thread</span>
          </div>
        )}

        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-sm">Select a thread or create a new one to get started.</p>
          </div>
        </div>
      </div>
    </AppPageShell>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
