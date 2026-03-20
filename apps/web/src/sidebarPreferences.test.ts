import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIDEBAR_PREFERENCES,
  normalizeSidebarPreferences,
  parseSidebarPreferences,
  pruneProjectOrder,
  reorderProjectOrder,
} from "./sidebarPreferences";

describe("normalizeSidebarPreferences", () => {
  it("falls back to defaults for invalid values", () => {
    expect(
      normalizeSidebarPreferences({
        projectOrder: [" project-1 ", "", "project-1", "project-2"],
        threadOrganization: "invalid" as never,
        threadSort: "invalid" as never,
        threadShow: "invalid" as never,
      }),
    ).toEqual({
      projectOrder: ["project-1", "project-2"],
      threadOrganization: "by-project",
      threadSort: "updated",
      threadShow: "all",
    });
  });
});

describe("parseSidebarPreferences", () => {
  it("returns defaults when parsing invalid json", () => {
    expect(parseSidebarPreferences("{")).toEqual(DEFAULT_SIDEBAR_PREFERENCES);
  });
});

describe("pruneProjectOrder", () => {
  it("drops ids that are no longer present", () => {
    expect(pruneProjectOrder(["project-1", "project-2"], ["project-2"])).toEqual(["project-2"]);
  });
});

describe("reorderProjectOrder", () => {
  it("moves a project before another project and appends missing ids", () => {
    expect(
      reorderProjectOrder(
        ["project-2"],
        "project-3",
        "project-1",
        "before",
        ["project-1", "project-2", "project-3"],
      ),
    ).toEqual(["project-2", "project-3", "project-1"]);
  });
});
