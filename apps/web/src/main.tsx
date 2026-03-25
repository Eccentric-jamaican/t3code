import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "@xterm/xterm/css/xterm.css";
import "./index.css";
import ACODE_ICON from "../../../assets/prod/ACODE.png";
import ACODE_DARK_ICON from "../../../assets/prod/ACODE-DARK.png";

import { applyDesktopWindowChromeMetrics } from "./desktopWindowChrome";
import { isElectron } from "./env";
import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";

const history = isElectron ? createHashHistory() : createBrowserHistory();

const router = getRouter(history);

document.title = APP_DISPLAY_NAME;
applyDesktopWindowChromeMetrics(document.documentElement);

function syncDocumentIcons() {
  const iconHref = document.documentElement.classList.contains("dark") ? ACODE_DARK_ICON : ACODE_ICON;

  for (const rel of ["icon", "apple-touch-icon"]) {
    const selector = `link[rel='${rel}']`;
    const existing = document.querySelector<HTMLLinkElement>(selector);
    if (existing) {
      existing.href = iconHref;
      continue;
    }

    const link = document.createElement("link");
    link.rel = rel;
    link.href = iconHref;
    document.head.append(link);
  }
}

syncDocumentIcons();

new MutationObserver(() => {
  syncDocumentIcons();
}).observe(document.documentElement, { attributeFilter: ["class"], attributes: true });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
