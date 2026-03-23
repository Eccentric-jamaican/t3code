import type { ServerReportClientDiagnosticInput } from "@t3tools/contracts";

import { useStore } from "./store";

const DUPLICATE_WINDOW_MS = 5_000;
const recentFingerprints = new Map<string, number>();

let currentRoute = "/";
let reporter:
  | ((input: ServerReportClientDiagnosticInput) => Promise<unknown>)
  | null = null;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanupExpiredFingerprints(now: number) {
  for (const [fingerprint, timestamp] of recentFingerprints) {
    if (now - timestamp > DUPLICATE_WINDOW_MS) {
      recentFingerprints.delete(fingerprint);
    }
  }
}

function firstPartyStackFrames(stack: string | undefined): string[] {
  if (!stack) {
    return [];
  }
  return stack
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("/src/") || line.includes("\\src\\") || line.includes("apps/web"))
    .slice(0, 3);
}

function buildClientFingerprint(input: {
  readonly source: ServerReportClientDiagnosticInput["source"];
  readonly category: ServerReportClientDiagnosticInput["category"];
  readonly severity: ServerReportClientDiagnosticInput["severity"];
  readonly summary: string;
  readonly detail: string | null;
  readonly stack?: string | undefined;
}): string {
  return [
    input.source,
    input.category,
    input.severity,
    normalizeText(input.summary),
    input.detail ? normalizeText(input.detail) : "",
    ...firstPartyStackFrames(input.stack),
  ].join("|");
}

function getRouteContext() {
  const href =
    typeof window !== "undefined" &&
    typeof window.location === "object" &&
    window.location !== null &&
    "href" in window.location &&
    typeof window.location.href === "string"
      ? window.location.href
      : null;
  const url = href ? new URL(href) : null;
  const pathname = currentRoute || url?.pathname || "/";
  const routeThreadId = pathname.startsWith("/") && pathname.split("/").filter(Boolean).length === 1
    ? pathname.slice(1)
    : null;
  const routeProjectId = url?.searchParams.get("projectId") ?? null;
  const store = useStore.getState();
  const thread = routeThreadId ? store.threads.find((entry) => entry.id === routeThreadId) ?? null : null;
  const project = routeProjectId
    ? store.projects.find((entry) => entry.id === routeProjectId) ?? null
    : null;

  return {
    route: pathname,
    threadId: thread?.id ?? null,
    projectId: thread?.projectId ?? project?.id ?? null,
  };
}

async function dispatchDiagnostic(input: ServerReportClientDiagnosticInput): Promise<void> {
  if (!reporter) {
    return;
  }
  await reporter(input);
}

export function setClientDiagnosticRoute(pathname: string): void {
  currentRoute = pathname;
}

export function setClientDiagnosticReporter(
  nextReporter: ((input: ServerReportClientDiagnosticInput) => Promise<unknown>) | null,
): void {
  reporter = nextReporter;
}

export function reportClientDiagnostic(
  input: Omit<ServerReportClientDiagnosticInput, "context" | "projectId" | "threadId"> & {
    readonly context?: Record<string, unknown>;
  },
): void {
  const routeContext = getRouteContext();
  const context: Record<string, unknown> = {
    route: routeContext.route,
    ...input.context,
  };
  const stackValue = context.stack;
  const causeValue = context.cause;
  const stack =
    typeof stackValue === "string"
      ? stackValue
      : typeof causeValue === "string"
        ? causeValue
        : undefined;
  const fingerprint = buildClientFingerprint({
    source: input.source,
    category: input.category,
    severity: input.severity,
    summary: input.summary,
    detail: input.detail ?? null,
    stack,
  });
  const now = Date.now();
  cleanupExpiredFingerprints(now);
  const previous = recentFingerprints.get(fingerprint);
  if (previous !== undefined && now - previous < DUPLICATE_WINDOW_MS) {
    return;
  }
  recentFingerprints.set(fingerprint, now);

  void dispatchDiagnostic({
    ...input,
    projectId: routeContext.projectId,
    threadId: routeContext.threadId,
    context,
  }).catch(() => undefined);
}
