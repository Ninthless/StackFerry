import path from "node:path";
import {
  app,
  BrowserWindow,
  net,
  protocol,
  session,
  shell,
} from "electron";
import { ControlClient } from "./controlClient";
import { registerWorkspaceIpc, unregisterWorkspaceIpc } from "./ipc";
import { desktopOrigin, desktopProtocol } from "../shared/ipc";

let controlClient: ControlClient | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: desktopProtocol,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

function createWindow(): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: "#f7f8fa",
    title: "StackFerry 1.0",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on("did-finish-load", () => {
    const loadedUrl = window.webContents.getURL();
    if (
      (rendererUrl && loadedUrl.startsWith(rendererUrl)) ||
      (!rendererUrl && loadedUrl.startsWith("file:"))
    ) {
      console.info("STACKFERRY_V1_READY");
    }
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.info("STACKFERRY_RENDERER_CONSOLE", level, message, sourceId, line);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      "STACKFERRY_RENDERER_GONE",
      details.reason,
      details.exitCode,
    );
  });
  window.webContents.on(
    "did-fail-load",
    (_event, code, description, url) => {
      console.error("STACKFERRY_V1_LOAD_FAILED", code, description, url);
      if (rendererUrl && url.startsWith(rendererUrl)) {
        setTimeout(() => {
          if (!window.isDestroyed()) {
            void window.loadURL(rendererUrl);
          }
        }, 300);
      }
    },
  );
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, rendererUrl)) {
      event.preventDefault();
    }
  });

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadURL(`${desktopOrigin}/index.html`);
  }
}

app.whenReady().then(() => {
  registerAppProtocol();
  configureSecurity();
  const databasePath = path.join(app.getPath("userData"), "stackferry-v1.db");
  controlClient = new ControlClient(
    databasePath,
    path.join(app.getPath("userData"), "backups"),
  );
  registerWorkspaceIpc(controlClient);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  unregisterWorkspaceIpc();
  controlClient?.close();
  controlClient = null;
});

function registerAppProtocol(): void {
  const rendererRoot = path.join(__dirname, "../renderer");
  protocol.handle(desktopProtocol, (request) => {
    const requestUrl = new URL(request.url);
    const relativePath =
      requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
    const resolvedPath = path.resolve(rendererRoot, relativePath);
    const relative = path.relative(rendererRoot, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(new URL(`file://${resolvedPath}`).toString());
  });
}

function configureSecurity(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    const isDev = Boolean(rendererUrl);
    const policy = [
      "default-src 'self'",
      `script-src 'self'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self'${rendererUrl ? ` ${rendererUrl} ws://127.0.0.1:5173` : ""}`,
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; ");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

function isTrustedRendererUrl(
  url: string,
  rendererUrl: string | undefined,
): boolean {
  return rendererUrl ? url.startsWith(rendererUrl) : url.startsWith(desktopOrigin);
}
