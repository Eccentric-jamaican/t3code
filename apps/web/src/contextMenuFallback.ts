import type { ContextMenuItem } from "@t3tools/contracts";

/**
 * Imperative DOM-based context menu for non-Electron environments.
 * Shows a positioned dropdown and returns a promise that resolves
 * with the clicked item id, or null if dismissed.
 */
export function showContextMenuFallback<T extends string>(
  items: readonly ContextMenuItem<T>[],
  position?: { x: number; y: number },
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let resolved = false;
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999";
    overlay.setAttribute("data-testid", "context-menu-overlay");

    const menu = document.createElement("div");
    menu.className =
      "fixed z-[10000] min-w-[140px] rounded-md border border-border bg-popover py-1 shadow-xl animate-in fade-in zoom-in-95";
    menu.setAttribute("data-testid", "context-menu-fallback");

    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    function cleanup(result: T | null) {
      if (resolved) {
        return;
      }
      resolved = true;
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      menu.remove();
      resolve(result);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(null);
      }
    }

    const stopMenuEvent = (event: Event) => {
      event.stopPropagation();
    };

    overlay.addEventListener("pointerdown", () => cleanup(null));
    menu.addEventListener("pointerdown", stopMenuEvent);
    menu.addEventListener("mousedown", stopMenuEvent);
    menu.addEventListener("click", stopMenuEvent);
    document.addEventListener("keydown", onKeyDown);

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-context-menu-item-id", item.id);
      btn.textContent = item.label;
      const isDestructiveAction = item.destructive === true || item.id === "delete";
      btn.className = isDestructiveAction
        ? "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-destructive hover:bg-accent cursor-default"
        : "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-popover-foreground hover:bg-accent cursor-default";
      btn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        cleanup(item.id);
      });
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(overlay);
    document.body.appendChild(menu);

    // Adjust if menu overflows viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 4}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 4}px`;
      }
    });
  });
}
