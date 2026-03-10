import { describe, expect, it } from "vitest";

import { buildQuotedSelectionInsertion } from "./selectedTextPrompt";

describe("buildQuotedSelectionInsertion", () => {
  it("formats a single-line selection into a quoted block for an empty composer", () => {
    expect(buildQuotedSelectionInsertion("", "What does daemon mean?")).toBe(
      "> What does daemon mean?\n\n",
    );
  });

  it("formats multi-line selections as markdown blockquotes", () => {
    expect(buildQuotedSelectionInsertion("", "line one\nline two")).toBe(
      "> line one\n> line two\n\n",
    );
  });

  it("returns the insertion fragment needed to append after existing composer text", () => {
    expect(buildQuotedSelectionInsertion("Help me understand this.", "line one\nline two")).toBe(
      "\n\n> line one\n> line two\n\n",
    );
  });

  it("normalizes surrounding whitespace and preserves intentional blank lines", () => {
    expect(buildQuotedSelectionInsertion("", "  line one  \n\n\nline two \n")).toBe(
      "> line one\n>\n> line two\n\n",
    );
  });

  it("returns null for selections that become empty after trimming", () => {
    expect(buildQuotedSelectionInsertion("Existing draft", "   \n\t  ")).toBeNull();
  });
});
