import type { NativeApi } from "@t3tools/contracts";

import { createWsNativeApi } from "./wsNativeApi";

let cachedApi: NativeApi | undefined;

function canCreateWsNativeApi(): boolean {
  if (typeof window === "undefined") return false;
  if (window.desktopBridge || window.nativeApi) return true;

  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (typeof envUrl === "string" && envUrl.length > 0) {
    return true;
  }

  return !import.meta.env.DEV;
}

export function readNativeApi(): NativeApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedApi) return cachedApi;

  if (window.nativeApi) {
    cachedApi = window.nativeApi;
    return cachedApi;
  }

  if (!canCreateWsNativeApi()) {
    return undefined;
  }

  cachedApi = createWsNativeApi();
  return cachedApi;
}

export function ensureNativeApi(): NativeApi {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Native API not found");
  }
  return api;
}
