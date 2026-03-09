import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import { APP_DESKTOP_STATE_ROOT_DIRNAME } from "@t3tools/shared/branding";

const LEGACY_DESKTOP_STATE_ROOT_DIRNAME = ".t3";

export function resolveDesktopStateDir(explicitStateDir?: string): string {
  const override = explicitStateDir?.trim();
  if (override) {
    return override;
  }

  const defaultStateDir = Path.join(OS.homedir(), APP_DESKTOP_STATE_ROOT_DIRNAME, "userdata");
  const legacyStateDir = Path.join(OS.homedir(), LEGACY_DESKTOP_STATE_ROOT_DIRNAME, "userdata");

  // Reuse the existing Alpha state directory when it is present so desktop
  // builds continue to share project/thread history with prior installs.
  if (legacyStateDir !== defaultStateDir && FS.existsSync(legacyStateDir)) {
    return legacyStateDir;
  }

  return defaultStateDir;
}
