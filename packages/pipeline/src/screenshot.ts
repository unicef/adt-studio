/**
 * Screenshot renderer — takes self-contained HTML and returns a PNG screenshot as base64.
 *
 * Uses Playwright headless Chromium. The caller manages the lifecycle:
 *   const renderer = await createScreenshotRenderer()
 *   try { ... } finally { await renderer.close() }
 */

import { randomUUID } from "node:crypto"
import {
  screenshotIpcCloseSchema,
  screenshotIpcReplySchema,
  screenshotIpcRequestSchema,
} from "@adt/types"

export const SCREENSHOT_VIEWPORTS = [
  { label: "desktop", width: 1280, height: 800 },
  { label: "tablet",  width: 768,  height: 1024 },
  { label: "mobile",  width: 390,  height: 844 },
] as const

/** Derive Tailwind responsive prefixes from viewport widths.
 *  Desktop-first: the default (no prefix) targets desktop, and `max-*`
 *  prefixes scale down to tablet and mobile. This matches the editor's
 *  desktop-first override model. */
export function getViewportBreakpoints() {
  return SCREENSHOT_VIEWPORTS.map((vp) => ({
    label: vp.label,
    width: vp.width,
    tailwind_prefix:
      vp.width >= 1024 ? "" :
      vp.width >= 640  ? "max-lg:" : "max-sm:",
  }))
}

/**
 * Whole-capture Chromium budget, matching Playwright's own per-operation default.
 * Interactive callers (thumbnail route, AI-edit previews) want to fail fast;
 * background callers that can afford to wait pass a longer `timeoutMs`.
 */
export const DEFAULT_SCREENSHOT_TIMEOUT_MS = 30_000

export interface ScreenshotRenderer {
  /** Render HTML to a PNG screenshot and return it as base64. */
  screenshot(
    html: string,
    viewport?: { width: number; height: number },
    options?: {
      signal?: AbortSignal
      /** Budget for the whole capture, not per step. Honored by the Playwright renderer. */
      timeoutMs?: number
    },
  ): Promise<string>
  /** Release browser resources. */
  close(): Promise<void>
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted")
}

/**
 * Create a Playwright-backed screenshot renderer.
 * Launches a headless Chromium browser once — call close() when done.
 *
 * Playwright is dynamically imported so startup does not eagerly load Chromium.
 */
export async function _createScreenshotRenderer(): Promise<ScreenshotRenderer> {
  // Dynamic import keeps this path lazy.
  const pw = await import("playwright" as string) as {
    chromium: {
      launch(opts: { headless: boolean }): Promise<PlaywrightBrowser>
    }
  }
  const browser = await pw.chromium.launch({ headless: true })

  return {
    async screenshot(
      html: string,
      viewport = { width: 1024, height: 768 },
      options: { signal?: AbortSignal; timeoutMs?: number } = {},
    ): Promise<string> {
      throwIfAborted(options.signal)
      // One budget for the whole capture. Passing the same `timeout` to each
      // Playwright call instead would let a slow page spend it three times over.
      // Floor at 1ms: Playwright reads `timeout: 0` as "wait forever".
      const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_SCREENSHOT_TIMEOUT_MS)
      const remaining = () => Math.max(1, deadline - Date.now())
      const context = await browser.newContext({ viewport })
      const onAbort = () => {
        void context.close().catch(() => {})
      }
      options.signal?.addEventListener("abort", onAbort, { once: true })
      try {
        throwIfAborted(options.signal)
        const page = await context.newPage()
        await page.setContent(html, { waitUntil: "load", timeout: remaining() })
        throwIfAborted(options.signal)
        // Wait for web fonts to finish loading before screenshotting
        await page.waitForFunction("document.fonts.ready", undefined, { timeout: remaining() })
        throwIfAborted(options.signal)
        // `animations: "disabled"` fast-forwards finite CSS animations and transitions
        // to their end state (and pauses infinite ones), so the capture shows a settled
        // page rather than whatever frame it happened to land on. Playwright's default
        // leaves animations untouched. This applies to every caller, review captures
        // and the thumbnail route alike — both want a deterministic image.
        const buffer = await page.screenshot({
          fullPage: true,
          type: "png",
          animations: "disabled",
          timeout: remaining(),
        })
        throwIfAborted(options.signal)
        return buffer.toString("base64")
      } finally {
        options.signal?.removeEventListener("abort", onAbort)
        await context.close().catch(() => {})
      }
    },

    async close(): Promise<void> {
      await browser.close()
    },
  }
}


export async function createScreenshotRenderer(): Promise<ScreenshotRenderer> {
  if (process.env?.ADT_ENVIRONMENT === 'electron') {
    return _createElectronScreenshotRenderer()
  }
  return _createScreenshotRenderer()
}

type ParentPortLike = {
  postMessage: (message: unknown) => void
  on: (
    event: "message",
    listener: (ev: { data: unknown }) => void
  ) => void
  off: (
    event: "message",
    listener: (ev: { data: unknown }) => void
  ) => void
}

function utilityParentPort(): ParentPortLike | null {
  const proc = process as NodeJS.Process & { type?: string; parentPort?: ParentPortLike }
  if (proc.type !== "utility" || !process.versions.electron) return null
  const p = proc.parentPort
  if (!p || typeof p.postMessage !== "function") return null
  if (typeof p.on !== "function" || typeof p.off !== "function") return null
  return p
}

/**
 * Electron `utilityProcess.fork` child: talk to main via `process.parentPort`.
 * `process.send` / `process.on("message")` are for Node `child_process.fork` only — they do not wire to main here.
 */
export async function _createElectronScreenshotRenderer(): Promise<ScreenshotRenderer> {
  const parentPort = utilityParentPort()
  if (!parentPort) {
    throw new Error(
      "Electron screenshots require a utility process (process.parentPort). Use utilityProcess.fork for the API, not child_process.fork."
    )
  }

  return {
    async screenshot(
      html: string,
      viewport = { width: 1024, height: 768 },
      // timeoutMs is Playwright-only — the Electron renderer captures via
      // BrowserWindow, which has no equivalent per-operation budget.
      options: { signal?: AbortSignal; timeoutMs?: number } = {},
    ): Promise<string> {
      throwIfAborted(options.signal)
      const id = randomUUID()
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          parentPort.off("message", onMessage)
          options.signal?.removeEventListener("abort", onAbort)
        }
        const onMessage = (ev: { data: unknown }) => {
          const parsed = screenshotIpcReplySchema.safeParse(ev.data)
          if (!parsed.success) return
          const msg = parsed.data
          if (msg.id !== id) return
          cleanup()
          if ("error" in msg) {
            reject(new Error(msg.error))
            return
          }
          resolve(msg.base64)
        }
        const onAbort = () => {
          cleanup()
          parentPort.postMessage(screenshotIpcCloseSchema.parse({ type: "screenshot-close" }))
          reject(new Error("Operation aborted"))
        }
        parentPort.on("message", onMessage)
        options.signal?.addEventListener("abort", onAbort, { once: true })
        const payload = screenshotIpcRequestSchema.parse({
          type: "screenshot-base64",
          id,
          html,
          viewport,
        })
        parentPort.postMessage(payload)
      })
    },

    async close(): Promise<void> {
      parentPort.postMessage(screenshotIpcCloseSchema.parse({ type: "screenshot-close" }))
    },
  }
}

// Minimal Playwright type shims (avoids requiring @playwright/test types)
interface PlaywrightBrowser {
  newContext(opts: { viewport: { width: number; height: number } }): Promise<PlaywrightContext>
  close(): Promise<void>
}

interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>
  close(): Promise<void>
}

interface PlaywrightPage {
  setContent(html: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>
  waitForFunction(
    expression: string,
    arg?: unknown,
    opts?: { timeout?: number }
  ): Promise<unknown>
  screenshot(opts?: {
    fullPage?: boolean
    type?: string
    animations?: "disabled" | "allow"
    timeout?: number
  }): Promise<Buffer>
}
