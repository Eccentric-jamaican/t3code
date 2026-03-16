import type {
  ServerCancelProviderLoginResult,
  ServerProviderAccount,
  ServerProviderAccountAuthMode,
  ServerProviderAccountSummary,
  ServerProviderPlanType,
  ServerProviderRateLimitBucket,
  ServerProviderRateLimitCredits,
  ServerProviderRateLimitWindow,
  ServerStartProviderLoginResult,
} from "@t3tools/contracts";
import { Effect, Layer, PubSub, Stream } from "effect";

import { buildCodexInitializeParams } from "../../codexAppServerManager";
import {
  CodexAppServerTransport,
  type CodexAppServerTransportOptions,
} from "../../codexAppServerTransport";
import { ServerConfig } from "../../config";
import { CodexAccountService, type CodexAccountServiceShape } from "../Services/CodexAccountService";

const PROVIDER = "codex" as const;

type ProviderAccountState = ServerProviderAccountSummary["state"];

const EMPTY_LOGIN_STATE: ServerProviderAccountSummary["login"] = {
  status: "idle",
  loginId: null,
  authUrl: null,
  error: null,
};

function nowIso(): string {
  return new Date().toISOString();
}

function initialSnapshot(): ServerProviderAccountSummary {
  return {
    provider: PROVIDER,
    state: "loading",
    authMode: null,
    requiresOpenaiAuth: null,
    account: null,
    rateLimits: [],
    login: EMPTY_LOGIN_STATE,
    message: null,
    updatedAt: nowIso(),
  };
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readString(record: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function readBoolean(record: Record<string, unknown> | undefined, ...keys: string[]): boolean | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function readInteger(record: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
  }
  return undefined;
}

function toIsoFromUnixSeconds(value: number | undefined): string | null {
  if (value === undefined || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function normalizeAuthMode(value: unknown): ServerProviderAccountAuthMode | null {
  switch (value) {
    case "apikey":
    case "chatgpt":
    case "chatgptAuthTokens":
      return value;
    default:
      return null;
  }
}

function normalizePlanType(value: unknown): ServerProviderPlanType | null {
  switch (value) {
    case "free":
    case "go":
    case "plus":
    case "pro":
    case "team":
    case "business":
    case "enterprise":
    case "edu":
    case "unknown":
      return value;
    default:
      return null;
  }
}

function normalizeAccount(value: unknown): ServerProviderAccount | null {
  const record = asObject(value);
  if (!record) {
    return null;
  }
  const type = readString(record, "type");
  if (type === "apiKey") {
    return { type: "apiKey" };
  }
  if (type === "chatgpt") {
    const email = readString(record, "email");
    const planType = normalizePlanType(record.planType) ?? "unknown";
    if (!email) {
      return null;
    }
    return {
      type: "chatgpt",
      email,
      planType,
    };
  }
  return null;
}

function normalizeRateLimitCredits(value: unknown): ServerProviderRateLimitCredits | null {
  const record = asObject(value);
  if (!record) {
    return null;
  }
  const hasCredits = readBoolean(record, "hasCredits", "has_credits");
  const unlimited = readBoolean(record, "unlimited");
  if (hasCredits === undefined || unlimited === undefined) {
    return null;
  }
  return {
    hasCredits,
    unlimited,
    balance: readString(record, "balance") ?? null,
  };
}

function normalizeRateLimitWindow(value: unknown): ServerProviderRateLimitWindow | null {
  const record = asObject(value);
  if (!record) {
    return null;
  }
  const usedPercent = readInteger(record, "usedPercent", "used_percent");
  if (usedPercent === undefined) {
    return null;
  }
  return {
    usedPercent,
    windowDurationMins: readInteger(record, "windowDurationMins", "window_duration_mins") ?? null,
    resetsAt: toIsoFromUnixSeconds(readInteger(record, "resetsAt", "resets_at")),
  };
}

function normalizeRateLimitBucket(value: unknown): ServerProviderRateLimitBucket | null {
  const record = asObject(value);
  if (!record) {
    return null;
  }
  return {
    limitId: readString(record, "limitId", "limit_id") ?? null,
    limitName: readString(record, "limitName", "limit_name") ?? null,
    planType: normalizePlanType(record.planType ?? record.plan_type),
    primary: normalizeRateLimitWindow(record.primary),
    secondary: normalizeRateLimitWindow(record.secondary),
    credits: normalizeRateLimitCredits(record.credits),
  };
}

function normalizeRateLimits(value: unknown): ServerProviderRateLimitBucket[] {
  const record = asObject(value);
  if (!record) {
    return [];
  }

  const rateLimitsByLimitId = asObject(record.rateLimitsByLimitId ?? record.rate_limits_by_limit_id);
  if (rateLimitsByLimitId && Object.keys(rateLimitsByLimitId).length > 0) {
    return Object.entries(rateLimitsByLimitId)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([, bucket]) => normalizeRateLimitBucket(bucket))
      .filter((bucket): bucket is ServerProviderRateLimitBucket => bucket !== null);
  }

  const singleBucket = normalizeRateLimitBucket(record.rateLimits ?? record.rate_limits ?? value);
  return singleBucket ? [singleBucket] : [];
}

function deriveState(account: ServerProviderAccount | null, fallback: ProviderAccountState): ProviderAccountState {
  if (account) {
    return "authenticated";
  }
  if (fallback === "error" || fallback === "loading") {
    return fallback;
  }
  return "unauthenticated";
}

export const CodexAccountServiceLive = Layer.effect(
  CodexAccountService,
  Effect.gen(function* () {
    const { cwd } = yield* ServerConfig;
    const updatesPubSub = yield* PubSub.unbounded<ServerProviderAccountSummary>();
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        transport?.close();
        transport = null;
      }),
    );

    let snapshot = initialSnapshot();
    let transport: CodexAppServerTransport | null = null;
    let startupPromise: Promise<CodexAppServerTransport> | null = null;
    let refreshPromise: Promise<void> = Promise.resolve();

    const publishSnapshot = () =>
      PubSub.publish(updatesPubSub, snapshot).pipe(Effect.asVoid);

    const setSnapshot = (updater: (current: ServerProviderAccountSummary) => ServerProviderAccountSummary) => {
      snapshot = {
        ...updater(snapshot),
        updatedAt: nowIso(),
      };
      void Effect.runPromise(publishSnapshot());
    };

    const withSerializedRefresh = (run: () => Promise<void>) => {
      refreshPromise = refreshPromise.then(run, run);
      return refreshPromise;
    };

    const refreshAccount = async (nextTransport: CodexAppServerTransport) => {
      const response = await nextTransport.request<unknown>("account/read", {
        refreshToken: false,
      });
      const record = asObject(response);
      const account = normalizeAccount(record?.account);
      const requiresOpenaiAuth = asBoolean(record?.requiresOpenaiAuth) ?? null;
      setSnapshot((current) => ({
        ...current,
        state: deriveState(account, current.state === "loading" ? "unauthenticated" : current.state),
        requiresOpenaiAuth,
        account,
        message: null,
      }));
    };

    const refreshRateLimits = async (nextTransport: CodexAppServerTransport) => {
      const response = await nextTransport.request<unknown>("account/rateLimits/read", null);
      setSnapshot((current) => ({
        ...current,
        rateLimits: normalizeRateLimits(response),
        message: null,
      }));
    };

    const refreshAll = (nextTransport: CodexAppServerTransport) =>
      withSerializedRefresh(async () => {
        await refreshAccount(nextTransport);
        await refreshRateLimits(nextTransport);
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to refresh Codex account state.";
        setSnapshot((current) => ({
          ...current,
          state: "error",
          message,
        }));
      });

    const attachTransportListeners = (nextTransport: CodexAppServerTransport) => {
      nextTransport.on("notification", (notification) => {
        void (async () => {
          switch (notification.method) {
            case "account/updated": {
              const params = asObject(notification.params);
              setSnapshot((current) => ({
                ...current,
                authMode: normalizeAuthMode(params?.authMode ?? params?.auth_mode),
              }));
              await refreshAccount(nextTransport);
              return;
            }
            case "account/rateLimits/updated":
              await refreshRateLimits(nextTransport);
              return;
            case "account/login/completed": {
              const params = asObject(notification.params);
              const success = asBoolean(params?.success) === true;
              if (!success) {
                setSnapshot((current) => ({
                  ...current,
                  login: {
                    status: "failed",
                    loginId: null,
                    authUrl: null,
                    error:
                      readString(params, "error") ?? "Codex account login did not complete successfully.",
                  },
                }));
                return;
              }
              setSnapshot((current) => ({
                ...current,
                login: EMPTY_LOGIN_STATE,
              }));
              await refreshAll(nextTransport);
              return;
            }
            case "auth/status": {
              const params = asObject(notification.params);
              setSnapshot((current) => ({
                ...current,
                authMode: normalizeAuthMode(params?.authMode ?? params?.auth_mode) ?? current.authMode,
              }));
              return;
            }
            default:
              return;
          }
        })().catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : `Failed to handle ${notification.method}.`;
          setSnapshot((current) => ({
            ...current,
            state: "error",
            message,
          }));
        });
      });

      nextTransport.on("error", (error) => {
        setSnapshot((current) => ({
          ...current,
          state: "error",
          message: error.message,
        }));
      });

      nextTransport.on("exit", ({ expected, code, signal }) => {
        if (transport === nextTransport) {
          transport = null;
        }
        if (expected) {
          return;
        }
        setSnapshot((current) => ({
          ...current,
          state: "error",
          message: `codex app-server exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        }));
      });
    };

    const startTransport = async () => {
      const options: CodexAppServerTransportOptions = { cwd };
      const nextTransport = new CodexAppServerTransport(options);
      attachTransportListeners(nextTransport);
      await nextTransport.request("initialize", buildCodexInitializeParams());
      nextTransport.notify("initialized");
      transport = nextTransport;
      await refreshAll(nextTransport);
      setSnapshot((current) => ({
        ...current,
        state: deriveState(current.account, "unauthenticated"),
      }));
      return nextTransport;
    };

    const ensureTransport = async () => {
      if (transport) {
        return transport;
      }
      if (startupPromise) {
        return startupPromise;
      }

      setSnapshot((current) => ({
        ...current,
        state: "loading",
        message: null,
      }));

      startupPromise = startTransport()
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Failed to start Codex account session.";
          setSnapshot((current) => ({
            ...current,
            state: "error",
            message,
          }));
          throw error instanceof Error ? error : new Error(message);
        })
        .finally(() => {
          startupPromise = null;
        });
      return startupPromise;
    };

    const service: CodexAccountServiceShape = {
      getSnapshot: () =>
        Effect.promise(async () => {
          try {
            await ensureTransport();
          } catch {
            // Keep the last snapshot and surface it to callers.
          }
          return snapshot;
        }),
      startChatGptLogin: () =>
        Effect.promise(async () => {
          const nextTransport = await ensureTransport();
          const response = await nextTransport.request<unknown>("account/login/start", {
            type: "chatgpt",
          });
          const record = asObject(response);
          if (readString(record, "type") !== "chatgpt") {
            throw new Error("Codex app-server did not return a ChatGPT login flow.");
          }
          const loginId = readString(record, "loginId", "login_id");
          const authUrl = readString(record, "authUrl", "auth_url");
          if (!loginId || !authUrl) {
            throw new Error("Codex app-server login response was missing login details.");
          }
          const result: ServerStartProviderLoginResult = {
            provider: PROVIDER,
            loginId,
            authUrl,
          };
          setSnapshot((current) => ({
            ...current,
            login: {
              status: "pending",
              loginId,
              authUrl,
              error: null,
            },
          }));
          return result;
        }),
      cancelLogin: (loginId: string) =>
        Effect.promise(async () => {
          const nextTransport = await ensureTransport();
          const response = await nextTransport.request<unknown>("account/login/cancel", {
            loginId,
          });
          const record = asObject(response);
          const status = readString(record, "status");
          if (status !== "canceled" && status !== "notFound") {
            throw new Error("Codex app-server returned an unexpected cancel-login result.");
          }
          const result: ServerCancelProviderLoginResult = { status };
          if (status === "canceled") {
            setSnapshot((current) => ({
              ...current,
              login: EMPTY_LOGIN_STATE,
            }));
          }
          return result;
        }),
      logout: () =>
        Effect.promise(async () => {
          const nextTransport = await ensureTransport();
          await nextTransport.request("account/logout", null);
          setSnapshot((current) => ({
            ...current,
            state: "unauthenticated",
            account: null,
            rateLimits: [],
            login: EMPTY_LOGIN_STATE,
            message: null,
          }));
          await refreshAccount(nextTransport);
        }),
      updates: Stream.fromPubSub(updatesPubSub),
    };

    return service;
  }),
);
