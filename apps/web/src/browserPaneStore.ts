import { create } from "zustand";

const STORAGE_KEY = "t3code:browser-pane:v1";
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 480;
const MAX_WIDTH = 900;

interface BrowserPanePersistedState {
  open?: boolean;
  width?: number;
}

export interface BrowserPaneState {
  open: boolean;
  width: number;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
}

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_WIDTH;
  }
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)));
}

function readPersistedState(): BrowserPanePersistedState {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as BrowserPanePersistedState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistState(state: { open: boolean; width: number }): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        open: state.open,
        width: state.width,
      }),
    );
  } catch {
    // Best-effort persistence only.
  }
}

const persisted = readPersistedState();

export const useBrowserPaneStore = create<BrowserPaneState>((set, get) => ({
  open: persisted.open === true,
  width: clampWidth(typeof persisted.width === "number" ? persisted.width : DEFAULT_WIDTH),
  setOpen: (open) => {
    set({ open });
    const next = get();
    persistState({ open: next.open, width: next.width });
  },
  setWidth: (width) => {
    set({ width: clampWidth(width) });
    const next = get();
    persistState({ open: next.open, width: next.width });
  },
}));

export const BROWSER_PANE_MIN_WIDTH = MIN_WIDTH;
