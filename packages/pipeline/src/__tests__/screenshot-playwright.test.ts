import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildBrowserChildEnv } from "../browser-env.js"
import { _createScreenshotRenderer, DEFAULT_SCREENSHOT_TIMEOUT_MS } from "../screenshot.js"
import { runVisualReviewLoop } from "../visual-review.js"

const playwright = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock("playwright", () => ({ chromium: { launch: playwright.launch } }))
vi.mock("../screenshot-html.js", () => ({ buildScreenshotHtml: async () => "html" }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function setupBrowser() {
  const page = {
    setContent: vi.fn(async () => {}),
    waitForFunction: vi.fn(async () => {}),
    screenshot: vi.fn(async () => Buffer.from("png")),
  }
  const context = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {}),
  }
  const browser = {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => {}),
  }
  playwright.launch.mockResolvedValue(browser)
  return { browser, context, page }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const phases = ["context", "page", "content", "fonts", "capture", "cleanup"] as const

function stall(phase: typeof phases[number], mocks: ReturnType<typeof setupBrowser>) {
  const pending = new Promise<never>(() => {})
  switch (phase) {
    case "context": mocks.browser.newContext.mockReturnValue(pending); break
    case "page": mocks.context.newPage.mockReturnValue(pending); break
    case "content": mocks.page.setContent.mockReturnValue(pending); break
    case "fonts": mocks.page.waitForFunction.mockReturnValue(pending); break
    case "capture": mocks.page.screenshot.mockReturnValue(pending); break
    case "cleanup": mocks.context.close.mockReturnValue(pending); break
  }
}

describe("Playwright screenshot lifecycle", () => {
  it("does not pass provider credentials to Chromium", () => {
    expect(buildBrowserChildEnv({
      PATH: "/bin",
      OPENAI_API_KEY: "openai-secret",
      ANTHROPIC_AUTH_TOKEN: "anthropic-secret",
      AZURE_SPEECH_REGION: "region",
      ADT_ENVIRONMENT: "electron",
    })).toEqual({
      PATH: "/bin",
      ADT_ENVIRONMENT: "electron",
    })
  })

  it.each(phases)("bounds stalled %s by the whole-capture deadline", async (phase) => {
    const mocks = setupBrowser()
    stall(phase, mocks)
    const renderer = await _createScreenshotRenderer()
    const result = renderer.screenshot("<p>test</p>", undefined, { timeoutMs: 100 })
    const rejection = expect(result).rejects.toThrow("Screenshot timed out after 100ms")
    await vi.advanceTimersByTimeAsync(100)
    await rejection
    expect(mocks.browser.close).not.toHaveBeenCalled()
    if (phase !== "context") expect(mocks.context.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(phases)("cancels immediately during stalled %s", async (phase) => {
    const mocks = setupBrowser()
    stall(phase, mocks)
    const renderer = await _createScreenshotRenderer()
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, "removeEventListener")
    const reason = new Error("Stop this run")
    const result = renderer.screenshot("<p>test</p>", undefined, { timeoutMs: 100, signal: controller.signal })
    const rejection = expect(result).rejects.toBe(reason)
    await vi.advanceTimersByTimeAsync(0)
    controller.abort(reason)
    await rejection
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(mocks.browser.close).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(["timeout", "abort"])("closes a context arriving after %s without creating a page", async (cause) => {
    const mocks = setupBrowser()
    const pending = deferred<typeof mocks.context>()
    mocks.browser.newContext.mockReturnValue(pending.promise)
    const renderer = await _createScreenshotRenderer()
    const controller = new AbortController()
    const result = renderer.screenshot("<p>test</p>", undefined, { timeoutMs: 100, signal: controller.signal })
    const rejection = expect(result).rejects.toThrow()
    if (cause === "abort") controller.abort()
    else await vi.advanceTimersByTimeAsync(100)
    await rejection
    pending.resolve(mocks.context)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.context.newPage).not.toHaveBeenCalled()
    expect(mocks.context.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not load a page that arrives after the deadline", async () => {
    const mocks = setupBrowser()
    const pending = deferred<typeof mocks.page>()
    mocks.context.newPage.mockReturnValue(pending.promise)
    const renderer = await _createScreenshotRenderer()
    const rejection = expect(renderer.screenshot("html", undefined, { timeoutMs: 100 })).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(100)
    await rejection
    pending.resolve(mocks.page)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.page.setContent).not.toHaveBeenCalled()
    expect(mocks.context.close).toHaveBeenCalledTimes(1)
  })

  it("does not let stuck cleanup hide an earlier capture failure indefinitely", async () => {
    const mocks = setupBrowser()
    mocks.page.screenshot.mockRejectedValue(new Error("capture failed"))
    mocks.context.close.mockReturnValue(new Promise(() => {}))
    const renderer = await _createScreenshotRenderer()
    const rejection = expect(renderer.screenshot("html", undefined, { timeoutMs: 100 })).rejects.toThrow("timed out")
    await vi.advanceTimersByTimeAsync(100)
    await rejection
    expect(mocks.context.close).toHaveBeenCalledTimes(1)
  })

  it("preserves ordinary capture failures when cleanup completes", async () => {
    const mocks = setupBrowser()
    const failure = new Error("capture failed")
    mocks.page.screenshot.mockRejectedValue(failure)
    const renderer = await _createScreenshotRenderer()
    await expect(renderer.screenshot("html")).rejects.toBe(failure)
    expect(mocks.context.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps successful captures deterministic and shares the operation budget", async () => {
    const mocks = setupBrowser()
    mocks.page.setContent.mockImplementation(async () => { vi.setSystemTime(40) })
    mocks.page.waitForFunction.mockImplementation(async () => { vi.setSystemTime(70) })
    const renderer = await _createScreenshotRenderer()
    await expect(renderer.screenshot("html", undefined, { timeoutMs: 100 })).resolves.toBe(Buffer.from("png").toString("base64"))
    expect(mocks.page.setContent).toHaveBeenCalledWith("html", { waitUntil: "load", timeout: 100 })
    expect(mocks.page.waitForFunction).toHaveBeenCalledWith("document.fonts.ready", undefined, { timeout: 60 })
    expect(mocks.page.screenshot).toHaveBeenCalledWith({ fullPage: true, type: "png", animations: "disabled", timeout: 30 })
    expect(mocks.context.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("uses the shared default deadline", async () => {
    const mocks = setupBrowser()
    stall("context", mocks)
    const renderer = await _createScreenshotRenderer()
    const rejection = expect(renderer.screenshot("html")).rejects.toThrow(`after ${DEFAULT_SCREENSHOT_TIMEOUT_MS}ms`)
    await vi.advanceTimersByTimeAsync(DEFAULT_SCREENSHOT_TIMEOUT_MS)
    await rejection
  })

  it("does not allocate a context for an already-cancelled call", async () => {
    const mocks = setupBrowser()
    const renderer = await _createScreenshotRenderer()
    const controller = new AbortController()
    controller.abort(new Error("already stopped"))
    await expect(renderer.screenshot("html", undefined, { signal: controller.signal })).rejects.toThrow("already stopped")
    expect(mocks.browser.newContext).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("leaves a concurrent capture and the shared browser alive after cancellation", async () => {
    const mocks = setupBrowser()
    const firstContext = { newPage: vi.fn(() => new Promise<never>(() => {})), close: vi.fn(async () => {}) }
    mocks.browser.newContext.mockResolvedValueOnce(firstContext)
    const renderer = await _createScreenshotRenderer()
    const controller = new AbortController()
    const first = renderer.screenshot("first", undefined, { signal: controller.signal })
    const rejection = expect(first).rejects.toThrow("cancel first")
    await vi.advanceTimersByTimeAsync(0)
    controller.abort(new Error("cancel first"))
    await rejection
    await expect(renderer.screenshot("second")).resolves.toBe(Buffer.from("png").toString("base64"))
    expect(firstContext.close).toHaveBeenCalledTimes(1)
    expect(mocks.browser.close).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("lets visual review retry stalled setup and then preserve the generated HTML", async () => {
    const mocks = setupBrowser()
    stall("context", mocks)
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const renderer = await _createScreenshotRenderer()
    const generateObject = vi.fn()
    const result = runVisualReviewLoop({
      initialHtml: "<section>Generated content</section>",
      label: "book",
      pageId: "pg001",
      images: new Map(),
      deps: {
        llmModel: { renderPrompt: async () => [], generateObject },
        screenshotRenderer: renderer,
        webAssetsDir: "/unused",
      },
      promptName: "visual_review",
      maxIterations: 3,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first",
      nextIterationScreenshotsText: "next",
      trailingContextText: "text section",
      validateHtml: () => ({ valid: true, errors: [] }),
    })
    await vi.advanceTimersByTimeAsync(120_000)
    await expect(result).resolves.toEqual({ html: "<section>Generated content</section>", approved: false })
    expect(mocks.browser.newContext).toHaveBeenCalledTimes(6)
    expect(generateObject).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
