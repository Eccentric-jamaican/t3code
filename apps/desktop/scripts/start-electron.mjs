import { spawn } from "node:child_process";
import { join } from "node:path";

import { desktopDir, resolveElectronPath } from "./electron-launcher.mjs";

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
const appEntryPath = join(desktopDir, "dist-electron", "bootstrap.js");

const child = spawn(resolveElectronPath(), [appEntryPath], {
  stdio: "inherit",
  cwd: desktopDir,
  env: childEnv,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
