import type { DesktopWindowChromeMetrics } from "@t3tools/contracts";

export const WINDOWS_TITLEBAR_HEIGHT_PX = 22;
export const MACOS_TITLEBAR_HEIGHT_PX = 52;
export const LINUX_TITLEBAR_HEIGHT_PX = 52;
const WINDOWS_LINUX_TRAILING_INSET_PX = 138;
const WINDOWS_CAPTION_BUTTON_LANE_WIDTH_PX = 104;
const LINUX_CAPTION_BUTTON_LANE_WIDTH_PX = 104;
const MACOS_CAPTION_BUTTON_LANE_WIDTH_PX = 0;
const MACOS_LEADING_INSET_PX = 140;

export function getDesktopWindowChromeMetrics(
  platform: NodeJS.Platform,
): DesktopWindowChromeMetrics {
  switch (platform) {
    case "darwin":
      return {
        platform,
        titlebarHeightPx: MACOS_TITLEBAR_HEIGHT_PX,
        leadingInsetPx: MACOS_LEADING_INSET_PX,
        trailingInsetPx: 0,
        captionButtonLaneWidthPx: MACOS_CAPTION_BUTTON_LANE_WIDTH_PX,
      };
    case "win32":
      return {
        platform,
        titlebarHeightPx: WINDOWS_TITLEBAR_HEIGHT_PX,
        leadingInsetPx: 0,
        trailingInsetPx: WINDOWS_LINUX_TRAILING_INSET_PX,
        captionButtonLaneWidthPx: WINDOWS_CAPTION_BUTTON_LANE_WIDTH_PX,
      };
    default:
      return {
        platform: "linux",
        titlebarHeightPx: LINUX_TITLEBAR_HEIGHT_PX,
        leadingInsetPx: 0,
        trailingInsetPx: WINDOWS_LINUX_TRAILING_INSET_PX,
        captionButtonLaneWidthPx: LINUX_CAPTION_BUTTON_LANE_WIDTH_PX,
      };
  }
}
