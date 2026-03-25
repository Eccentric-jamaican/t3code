import * as React from "react";

import { cn } from "~/lib/utils";
import { SidebarInset } from "~/components/ui/sidebar";

function AppPageShell({
  className,
  style,
  ...props
}: React.ComponentProps<typeof SidebarInset>) {
  return (
    <SidebarInset
      className={cn(
        "min-h-0 overflow-hidden overscroll-y-none bg-[var(--app-page-shell-surface)]",
        "md:m-2 md:rounded-[12px]",
        className,
      )}
      style={style}
      {...props}
    />
  );
}

export default AppPageShell;
