function normalizeSelectedText(selectedText: string): string {
  return selectedText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

function formatQuotedSelection(selectedText: string): string | null {
  const normalizedSelection = normalizeSelectedText(selectedText);
  if (normalizedSelection.length === 0) {
    return null;
  }

  return normalizedSelection
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

export function buildQuotedSelectionInsertion(
  draftText: string,
  selectedText: string,
): string | null {
  const quotedSelection = formatQuotedSelection(selectedText);
  if (!quotedSelection) {
    return null;
  }

  if (draftText.length === 0) {
    return `${quotedSelection}\n\n`;
  }

  const separator = draftText.endsWith("\n\n") ? "" : draftText.endsWith("\n") ? "\n" : "\n\n";
  return `${separator}${quotedSelection}\n\n`;
}
