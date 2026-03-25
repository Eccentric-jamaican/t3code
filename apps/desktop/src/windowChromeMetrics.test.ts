import { describe, expect, it } from "vitest";

import {
  LINUX_TITLEBAR_HEIGHT_PX,
  MACOS_TITLEBAR_HEIGHT_PX,
  WINDOWS_TITLEBAR_HEIGHT_PX,
  getDesktopWindowChromeMetrics,
} from "./windowChromeMetrics";

describe("getDesktopWindowChromeMetrics", () => {
  it("returns the expected macOS metrics", () => {
    expect(getDesktopWindowChromeMetrics("darwin")).toEqual({
      platform: "darwin",
      titlebarHeightPx: MACOS_TITLEBAR_HEIGHT_PX,
      leadingInsetPx: 140,
      trailingInsetPx: 0,
      captionButtonLaneWidthPx: 0,
    });
  });

  it("returns the expected Windows metrics", () => {
    expect(getDesktopWindowChromeMetrics("win32")).toEqual({
      platform: "win32",
      titlebarHeightPx: WINDOWS_TITLEBAR_HEIGHT_PX,
      leadingInsetPx: 0,
      trailingInsetPx: 138,
      captionButtonLaneWidthPx: 104,
    });
  });

  it("returns the expected Linux metrics", () => {
    expect(getDesktopWindowChromeMetrics("linux")).toEqual({
      platform: "linux",
      titlebarHeightPx: LINUX_TITLEBAR_HEIGHT_PX,
      leadingInsetPx: 0,
      trailingInsetPx: 138,
      captionButtonLaneWidthPx: 104,
    });
  });
});
