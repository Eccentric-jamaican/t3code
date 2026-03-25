import type { DesktopWindowChromeMetrics } from "@t3tools/contracts";

type ResolvedDesktopWindowChromeMetrics = Omit<DesktopWindowChromeMetrics, "platform"> & {
  platform: DesktopWindowChromeMetrics["platform"] | null;
};

const DEFAULT_DESKTOP_WINDOW_CHROME_METRICS: ResolvedDesktopWindowChromeMetrics = {
  platform: null,
  titlebarHeightPx: 0,
  leadingInsetPx: 0,
  trailingInsetPx: 0,
  captionButtonLaneWidthPx: 0,
};

export function readDesktopWindowChromeMetrics(): ResolvedDesktopWindowChromeMetrics {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (typeof bridge?.getWindowChromeMetrics !== "function") {
    return DEFAULT_DESKTOP_WINDOW_CHROME_METRICS;
  }

  try {
    const metrics = bridge.getWindowChromeMetrics();
    return {
      platform: metrics.platform,
      titlebarHeightPx: metrics.titlebarHeightPx,
      leadingInsetPx: metrics.leadingInsetPx,
      trailingInsetPx: metrics.trailingInsetPx,
      captionButtonLaneWidthPx: metrics.captionButtonLaneWidthPx,
    };
  } catch {
    return DEFAULT_DESKTOP_WINDOW_CHROME_METRICS;
  }
}

export function applyDesktopWindowChromeMetrics(root: HTMLElement): ResolvedDesktopWindowChromeMetrics {
  const metrics = readDesktopWindowChromeMetrics();
  root.style.setProperty("--desktop-native-leading-safe-area-width", `${metrics.leadingInsetPx}px`);
  root.style.setProperty(
    "--desktop-native-trailing-safe-area-width",
    `${metrics.trailingInsetPx}px`,
  );
  root.style.setProperty(
    "--desktop-caption-button-lane-width",
    `${metrics.captionButtonLaneWidthPx}px`,
  );
  root.style.setProperty("--desktop-native-titlebar-height", `${metrics.titlebarHeightPx}px`);

  if (metrics.platform) {
    root.dataset.desktopPlatform = metrics.platform;
  } else {
    root.removeAttribute("data-desktop-platform");
  }

  return metrics;
}
