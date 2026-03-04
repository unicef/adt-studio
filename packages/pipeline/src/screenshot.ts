/**
 * Screenshot renderer — takes self-contained HTML and returns a PNG screenshot as base64.
 *
 * Uses Playwright headless Chromium. The caller manages the lifecycle:
 *   const renderer = await createScreenshotRenderer()
 *   try { ... } finally { await renderer.close() }
 */

export const SCREENSHOT_VIEWPORTS = [
  { label: "desktop", width: 1280, height: 800 },
  { label: "tablet",  width: 768,  height: 1024 },
  { label: "mobile",  width: 390,  height: 844 },
] as const

/** Derive Tailwind responsive prefixes from viewport widths. */
export function getViewportBreakpoints() {
  return SCREENSHOT_VIEWPORTS.map((vp) => ({
    label: vp.label,
    width: vp.width,
    tailwind_prefix:
      vp.width >= 1280 ? "xl:" :
      vp.width >= 1024 ? "lg:" :
      vp.width >= 768  ? "md:" : "",
  }))
}

export interface ScreenshotRenderer {
  /** Render HTML to a PNG screenshot and return it as base64. */
  screenshot(
    html: string,
    viewport?: { width: number; height: number }
  ): Promise<string>
  /** Release browser resources. */
  close(): Promise<void>
}

/**
 * Create a Playwright-backed screenshot renderer.
 * Launches a headless Chromium browser once — call close() when done.
 *
 * Playwright is dynamically imported so startup does not eagerly load Chromium.
 */
export async function createScreenshotRenderer(): Promise<ScreenshotRenderer> {
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
      viewport = { width: 1024, height: 768 }
    ): Promise<string> {
      const context = await browser.newContext({ viewport })
      try {
        const page = await context.newPage()
        await page.setContent(html, { waitUntil: "load" })
        // Wait for web fonts to finish loading before screenshotting
        await page.waitForFunction("document.fonts.ready")
        const buffer = await page.screenshot({ fullPage: true, type: "png" })
        return buffer.toString("base64")
      } finally {
        await context.close()
      }
    },

    async close(): Promise<void> {
      await browser.close()
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
  setContent(html: string, opts?: { waitUntil?: string }): Promise<void>
  waitForFunction(expression: string): Promise<unknown>
  screenshot(opts?: { fullPage?: boolean; type?: string }): Promise<Buffer>
}
