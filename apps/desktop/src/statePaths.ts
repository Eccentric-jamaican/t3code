import * as OS from "node:os";
import * as Path from "node:path";

import { APP_DESKTOP_STATE_ROOT_DIRNAME } from "@t3tools/shared/branding";

export function resolveDesktopStateDir(explicitStateDir?: string): string {
  const override = explicitStateDir?.trim();
  if (override) {
    return override;
  }

  return Path.join(OS.homedir(), APP_DESKTOP_STATE_ROOT_DIRNAME, "userdata");
}
