import type { DesktopBridge } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyDesktopWindowChromeMetrics, readDesktopWindowChromeMetrics } from "./desktopWindowChrome";

function createRootElementForTest(): HTMLElement & {
  dataset: Record<string, string | undefined>;
  style: CSSStyleDeclaration;
} {
  const values = new Map<string, string>();
  const style = {
    getPropertyValue: (name: string) => values.get(name) ?? "",
    removeProperty: (name: string) => {
      const previous = values.get(name) ?? "";
      values.delete(name);
      return previous;
    },
    setProperty: (name: string, value: string) => {
      values.set(name, value);
    },
  } as CSSStyleDeclaration;

  const root = {
    dataset: {},
    removeAttribute: (name: string) => {
      if (name === "data-desktop-platform") {
        delete root.dataset.desktopPlatform;
      }
    },
    style,
  } as HTMLElement & {
    dataset: Record<string, string | undefined>;
    style: CSSStyleDeclaration;
  };

  return root;
}

describe("desktopWindowChrome", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to zeros when the desktop bridge is missing", () => {
    vi.stubGlobal("window", {});

    expect(readDesktopWindowChromeMetrics()).toEqual({
      platform: null,
      titlebarHeightPx: 0,
      leadingInsetPx: 0,
      trailingInsetPx: 0,
      captionButtonLaneWidthPx: 0,
    });
  });

  it("reads the window chrome metrics from the desktop bridge", () => {
    vi.stubGlobal("window", {
      desktopBridge: {
        getWindowChromeMetrics: () => ({
          platform: "win32",
          titlebarHeightPx: 22,
          leadingInsetPx: 0,
          trailingInsetPx: 138,
          captionButtonLaneWidthPx: 104,
        }),
      } as DesktopBridge,
    });

    expect(readDesktopWindowChromeMetrics()).toEqual({
      platform: "win32",
      titlebarHeightPx: 22,
      leadingInsetPx: 0,
      trailingInsetPx: 138,
      captionButtonLaneWidthPx: 104,
    });
  });

  it("applies the metrics as CSS custom properties", () => {
    const root = createRootElementForTest();
    vi.stubGlobal("window", {
      desktopBridge: {
        getWindowChromeMetrics: () => ({
          platform: "darwin",
          titlebarHeightPx: 52,
          leadingInsetPx: 140,
          trailingInsetPx: 0,
          captionButtonLaneWidthPx: 0,
        }),
      } as DesktopBridge,
    });

    const metrics = applyDesktopWindowChromeMetrics(root);

    expect(metrics).toEqual({
      platform: "darwin",
      titlebarHeightPx: 52,
      leadingInsetPx: 140,
      trailingInsetPx: 0,
      captionButtonLaneWidthPx: 0,
    });
    expect(root.style.getPropertyValue("--desktop-native-leading-safe-area-width")).toBe("140px");
    expect(root.style.getPropertyValue("--desktop-native-trailing-safe-area-width")).toBe("0px");
    expect(root.style.getPropertyValue("--desktop-caption-button-lane-width")).toBe("0px");
    expect(root.style.getPropertyValue("--desktop-native-titlebar-height")).toBe("52px");
    expect(root.dataset.desktopPlatform).toBe("darwin");
  });
});
