import { useCallback, useSyncExternalStore } from "react";

export type SidebarThreadOrganization = "by-project" | "chronological";
export type SidebarThreadSort = "created" | "updated";
export type SidebarThreadShow = "all" | "relevant";

export interface SidebarPreferences {
  projectOrder: string[];
  threadOrganization: SidebarThreadOrganization;
  threadSort: SidebarThreadSort;
  threadShow: SidebarThreadShow;
}

const SIDEBAR_PREFERENCES_STORAGE_KEY = "t3code:sidebar-preferences:v1";

export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  projectOrder: [],
  threadOrganization: "by-project",
  threadSort: "updated",
  threadShow: "all",
};

let listeners: Array<() => void> = [];
let cachedRawPreferences: string | null | undefined;
let cachedSnapshot: SidebarPreferences = DEFAULT_SIDEBAR_PREFERENCES;

function normalizeProjectOrder(projectOrder: Iterable<string | null | undefined>): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const candidate of projectOrder) {
    const trimmed = candidate?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function normalizeSidebarPreferences(
  preferences: Partial<SidebarPreferences> | null | undefined,
): SidebarPreferences {
  return {
    projectOrder: normalizeProjectOrder(preferences?.projectOrder ?? []),
    threadOrganization:
      preferences?.threadOrganization === "chronological" ? "chronological" : "by-project",
    threadSort: preferences?.threadSort === "created" ? "created" : "updated",
    threadShow: preferences?.threadShow === "relevant" ? "relevant" : "all",
  };
}

export function parseSidebarPreferences(
  rawPreferences: string | null | undefined,
): SidebarPreferences {
  if (!rawPreferences) {
    return DEFAULT_SIDEBAR_PREFERENCES;
  }

  try {
    return normalizeSidebarPreferences(
      JSON.parse(rawPreferences) as Partial<SidebarPreferences> | null | undefined,
    );
  } catch {
    return DEFAULT_SIDEBAR_PREFERENCES;
  }
}

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getSidebarPreferencesSnapshot(): SidebarPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_PREFERENCES;
  }

  const rawPreferences = window.localStorage.getItem(SIDEBAR_PREFERENCES_STORAGE_KEY);
  if (rawPreferences === cachedRawPreferences) {
    return cachedSnapshot;
  }

  cachedRawPreferences = rawPreferences;
  cachedSnapshot = parseSidebarPreferences(rawPreferences);
  return cachedSnapshot;
}

export function persistSidebarPreferences(nextPreferences: SidebarPreferences): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeSidebarPreferences(nextPreferences);
  const rawPreferences = JSON.stringify(normalized);
  if (rawPreferences === cachedRawPreferences) {
    cachedSnapshot = normalized;
    return;
  }

  window.localStorage.setItem(SIDEBAR_PREFERENCES_STORAGE_KEY, rawPreferences);
  cachedRawPreferences = rawPreferences;
  cachedSnapshot = normalized;
  emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

export function pruneProjectOrder(
  projectOrder: readonly string[],
  availableProjectIds: readonly string[],
): string[] {
  const availableIds = new Set(availableProjectIds);
  return projectOrder.filter((projectId) => availableIds.has(projectId));
}

export function reorderProjectOrder(
  projectOrder: readonly string[],
  sourceProjectId: string,
  targetProjectId: string,
  position: "before" | "after",
  availableProjectIds: readonly string[],
): string[] {
  const orderedProjectIds = normalizeProjectOrder([
    ...pruneProjectOrder(projectOrder, availableProjectIds),
    ...availableProjectIds,
  ]);
  const sourceIndex = orderedProjectIds.indexOf(sourceProjectId);
  const targetIndex = orderedProjectIds.indexOf(targetProjectId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceProjectId === targetProjectId) {
    return orderedProjectIds;
  }

  const nextOrder = [...orderedProjectIds];
  const [movedProjectId] = nextOrder.splice(sourceIndex, 1);
  if (!movedProjectId) {
    return orderedProjectIds;
  }

  const targetInsertIndex = nextOrder.indexOf(targetProjectId);
  if (targetInsertIndex === -1) {
    return orderedProjectIds;
  }

  const insertIndex = position === "after" ? targetInsertIndex + 1 : targetInsertIndex;
  nextOrder.splice(insertIndex, 0, movedProjectId);
  return nextOrder;
}

export function useSidebarPreferences() {
  const preferences = useSyncExternalStore(subscribe, getSidebarPreferencesSnapshot);

  const updatePreferences = useCallback(
    (
      patch:
        | Partial<SidebarPreferences>
        | ((currentPreferences: SidebarPreferences) => SidebarPreferences),
    ) => {
      const currentPreferences = getSidebarPreferencesSnapshot();
      const nextPreferences =
        typeof patch === "function"
          ? normalizeSidebarPreferences(patch(currentPreferences))
          : normalizeSidebarPreferences({
              ...currentPreferences,
              ...patch,
            });
      persistSidebarPreferences(nextPreferences);
    },
    [],
  );

  return {
    preferences,
    updatePreferences,
  };
}
