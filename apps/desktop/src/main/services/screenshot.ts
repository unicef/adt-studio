import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { htmlStore } from "../protocols/html-render";

const windows = new Set<InstanceType<typeof BrowserWindow>>();

const DEFAULT_SCREENSHOT_TIMEOUT_MS = 30_000;

/* An offscreen BrowserWindow can wedge without ever emitting did-finish-load or
   did-fail-load (a pending subresource, a window that never paints), so every
   await here needs its own ceiling — otherwise the capture never settles, the
   caller waits forever, and the window leaks. */
function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${message} (${timeoutMs}ms)`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

async function screenshot(
  html: string,
  viewport: { width: number; height: number },
  timeoutMs: number = DEFAULT_SCREENSHOT_TIMEOUT_MS,
): Promise<string> {
  const id = randomUUID();
  htmlStore.set(id, html);

  const win = new BrowserWindow({
    width: viewport.width,
    height: viewport.height,
    show: false,
    webPreferences: { offscreen: true },
  });
  windows.add(win);

  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());

  try {
    const loadPromise = new Promise<void>((resolve, reject) => {
      win.webContents.once("did-finish-load", resolve);
      win.webContents.once("did-fail-load", (_, _code, desc) =>
        reject(new Error(desc)),
      );
    });

    await withDeadline(
      win.loadURL(`html-render://${id}`),
      remaining(),
      "Timed out loading the screenshot page",
    );
    await withDeadline(
      loadPromise,
      remaining(),
      "Screenshot page never finished loading",
    );

    const image = await withDeadline(
      win.webContents.capturePage(),
      remaining(),
      "Timed out capturing the screenshot",
    );
    return image.toPNG().toString("base64");
  } finally {
    windows.delete(win);
    if (!win.isDestroyed()) win.destroy();
    htmlStore.delete(id);
  }
}

async function close(): Promise<void> {
  try {
    for (const win of windows) {
      win.destroy();
    }
    windows.clear();
  } catch {}
}

export { screenshot, close };
