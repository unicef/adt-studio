import { beforeEach, describe, expect, it, vi } from "vitest";

const instances: FakeBrowserWindow[] = [];
const pngBase64 = Buffer.from("png").toString("base64");

type Capture = () => Promise<{ toPNG: () => Buffer }>;

const okCapture: Capture = async () => ({ toPNG: () => Buffer.from("png") });

class FakeWebContents {
  handlers = new Map<string, (...args: unknown[]) => void>();
  capture: Capture = okCapture;

  once(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
  }

  capturePage() {
    return this.capture();
  }

  finishLoad() {
    this.handlers.get("did-finish-load")?.();
  }
}

class FakeBrowserWindow {
  static autoFinishLoad = true;
  static capture: Capture = okCapture;

  webContents = new FakeWebContents();
  destroy = vi.fn(() => {
    this.destroyed = true;
  });
  destroyed = false;

  constructor() {
    instances.push(this);
    this.webContents.capture = FakeBrowserWindow.capture;
    setTimeout(() => {
      if (FakeBrowserWindow.autoFinishLoad) this.webContents.finishLoad();
    }, 0);
  }

  isDestroyed() {
    return this.destroyed;
  }

  async loadURL() {}
}

vi.mock("electron", () => ({ BrowserWindow: FakeBrowserWindow }));
vi.mock("electron/main", () => ({ protocol: { handle: vi.fn() } }));

const { screenshot } = await import("./screenshot");
const { htmlStore } = await import("../protocols/html-render");

beforeEach(() => {
  instances.length = 0;
  htmlStore.clear();
  FakeBrowserWindow.autoFinishLoad = true;
  FakeBrowserWindow.capture = okCapture;
});

const viewport = { width: 800, height: 600 };

describe("screenshot", () => {
  it("captures the page, then destroys the window and drops the stored HTML", async () => {
    await expect(screenshot("<p>hi</p>", viewport, 1_000)).resolves.toBe(
      pngBase64,
    );

    expect(instances[0].destroy).toHaveBeenCalledOnce();
    expect(htmlStore.size).toBe(0);
  });

  it("fails instead of hanging when the page never finishes loading", async () => {
    FakeBrowserWindow.autoFinishLoad = false;

    await expect(screenshot("<p>hi</p>", viewport, 25)).rejects.toThrow(
      /never finished loading/i,
    );

    expect(instances[0].destroy).toHaveBeenCalledOnce();
    expect(htmlStore.size).toBe(0);
  });

  it("fails instead of hanging when the capture never settles", async () => {
    FakeBrowserWindow.capture = () => new Promise(() => {});

    await expect(screenshot("<p>hi</p>", viewport, 25)).rejects.toThrow(
      /capturing the screenshot/i,
    );

    expect(instances[0].destroy).toHaveBeenCalledOnce();
    expect(htmlStore.size).toBe(0);
  });
});
