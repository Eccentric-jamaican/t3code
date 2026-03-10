export type ChatSelectionSourceKind = "assistant-message" | "proposed-plan";

function clampBoundaryOffset(node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.max(0, Math.min(node.textContent?.length ?? 0, offset));
  }
  return Math.max(0, Math.min(node.childNodes.length, offset));
}

export function normalizeSelectedText(selectedText: string): string {
  return selectedText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

export function formatQuotedSelection(selectedText: string): string | null {
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

function getPlainTextBoundaryOffset(
  container: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  if (!container.contains(node)) {
    return null;
  }
  const range = document.createRange();
  range.selectNodeContents(container);
  try {
    range.setEnd(node, clampBoundaryOffset(node, offset));
  } catch {
    return null;
  }
  return range.cloneContents().textContent?.length ?? 0;
}

export function serializeRangeWithinContainer(
  container: HTMLElement,
  range: Range,
): { plainTextStart: number; plainTextEnd: number } | null {
  const plainTextStart = getPlainTextBoundaryOffset(
    container,
    range.startContainer,
    range.startOffset,
  );
  const plainTextEnd = getPlainTextBoundaryOffset(container, range.endContainer, range.endOffset);
  if (plainTextStart === null || plainTextEnd === null || plainTextEnd <= plainTextStart) {
    return null;
  }
  return { plainTextStart, plainTextEnd };
}

interface TextBoundary {
  node: Text;
  offset: number;
}

function resolveTextBoundary(
  container: HTMLElement,
  targetOffset: number,
  preferEnd: boolean,
): TextBoundary | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  let traversed = 0;
  let lastTextNode: Text | null = null;

  while (current) {
    const textNode = current as Text;
    const textLength = textNode.textContent?.length ?? 0;
    const nextTraversed = traversed + textLength;
    if (targetOffset < nextTraversed || (!preferEnd && targetOffset === nextTraversed)) {
      return {
        node: textNode,
        offset: Math.max(0, Math.min(textLength, targetOffset - traversed)),
      };
    }
    traversed = nextTraversed;
    lastTextNode = textNode;
    current = walker.nextNode();
  }

  if (!lastTextNode) {
    return null;
  }

  return {
    node: lastTextNode,
    offset: preferEnd ? (lastTextNode.textContent?.length ?? 0) : 0,
  };
}

export function reconstructRangeFromOffsets(
  container: HTMLElement,
  plainTextStart: number,
  plainTextEnd: number,
): Range | null {
  if (plainTextStart < 0 || plainTextEnd <= plainTextStart) {
    return null;
  }

  const textContentLength = container.textContent?.length ?? 0;
  if (plainTextEnd > textContentLength) {
    return null;
  }

  const startBoundary = resolveTextBoundary(container, plainTextStart, false);
  const endBoundary = resolveTextBoundary(container, plainTextEnd, true);
  if (!startBoundary || !endBoundary) {
    return null;
  }

  const range = document.createRange();
  try {
    range.setStart(startBoundary.node, startBoundary.offset);
    range.setEnd(endBoundary.node, endBoundary.offset);
  } catch {
    return null;
  }
  return range.collapsed ? null : range;
}
