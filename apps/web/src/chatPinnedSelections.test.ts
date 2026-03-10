import { describe, expect, it } from "vitest";

import {
  buildQuotedSelectionInsertion,
  formatQuotedSelection,
  normalizeSelectedText,
} from "./chatPinnedSelections";

describe("chatPinnedSelections", () => {
  it("normalizes selected text while preserving intentional blank lines", () => {
    expect(normalizeSelectedText("  line one  \n\n\nline two \n")).toBe("line one\n\nline two");
  });

  it("formats quoted selections as markdown blockquotes", () => {
    expect(formatQuotedSelection("First line\n\nSecond line")).toBe(
      "> First line\n>\n> Second line",
    );
  });

  it("builds a composer insertion fragment for quoted selections", () => {
    expect(buildQuotedSelectionInsertion("Existing draft", "Useful passage")).toBe(
      "\n\n> Useful passage\n\n",
    );
  });
});
