import { contextBridge, ipcRenderer } from "electron";

const BROWSER_PAGE_EVENT_CHANNEL = "desktop:browser-page-event";

contextBridge.exposeInMainWorld("__t3BrowserHost", {
  inspectSelectionChanged: (hasSelection: boolean) => {
    ipcRenderer.send(BROWSER_PAGE_EVENT_CHANNEL, {
      type: "inspect-selection-changed",
      hasSelection,
    });
  },
});
