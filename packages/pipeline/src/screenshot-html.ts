/**
 * Build a self-contained HTML document from section HTML for screenshot rendering.
 *
 * - Rewrites image src paths to inline base64 data URIs
 * - Inlines Tailwind CSS (built from the section's class usage)
 * - Embeds Merriweather font files as base64 @font-face rules
 */
import fs from "node:fs"
import path from "node:path"
import { buildPreviewTailwindCss } from "./package-web.js"

export interface BuildScreenshotHtmlOptions {
  /** The section HTML fragment (content inside <body>). */
  sectionHtml: string
  /** Book label, used to match image src paths for rewriting. */
  label: string
  /** Map of imageId → base64 data for inline embedding. */
  images: Map<string, { base64: string }>
  /** Path to the web assets directory (fonts, tailwind config, etc). */
  webAssetsDir: string
  /** HTML lang attribute. Defaults to "en". */
  language?: string
}

/**
 * Produce a complete, self-contained HTML document suitable for headless screenshot rendering.
 * All external resources (CSS, fonts, images) are inlined so no network/file access is needed.
 */
export async function buildScreenshotHtml(
  options: BuildScreenshotHtmlOptions
): Promise<string> {
  const {
    sectionHtml,
    label,
    images,
    webAssetsDir,
    language = "en",
  } = options

  // Rewrite image src attributes to inline base64 data URIs
  const htmlWithInlineImages = rewriteImageSrcs(sectionHtml, label, images)

  // Build Tailwind CSS from the section content
  const tailwindCss = await buildPreviewTailwindCss(
    htmlWithInlineImages,
    webAssetsDir
  )

  // Build inline font-face CSS with base64-encoded font files
  const fontCss = buildInlineFontCss(webAssetsDir)

  return `<!DOCTYPE html>
<html lang="${escapeAttr(language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${tailwindCss}</style>
  <style>${fontCss}</style>
</head>
<body class="min-h-screen flex items-center justify-center">
  <div id="content">
  ${htmlWithInlineImages}
  </div>
</body>
</html>`
}

/**
 * Rewrite `<img src="/api/books/{label}/images/{imageId}">` to
 * `<img src="data:image/jpeg;base64,...">` using the provided images map.
 */
function rewriteImageSrcs(
  html: string,
  label: string,
  images: Map<string, { base64: string }>
): string {
  // Match src attributes pointing to the book's image API endpoint
  const pattern = new RegExp(
    `src=["']/api/books/${escapeRegex(label)}/images/([^"']+)["']`,
    "g"
  )
  return html.replace(pattern, (_match, imageId: string) => {
    const img = images.get(imageId)
    if (img) {
      return `src="data:image/jpeg;base64,${img.base64}"`
    }
    // If no base64 data available, leave as-is (will show broken image)
    return _match
  })
}

function buildInlineFontCss(webAssetsDir: string): string {
  const rules: string[] = []

  const regularPath = path.join(
    webAssetsDir,
    "fonts",
    "Merriweather-VariableFont.woff2"
  )
  const italicPath = path.join(
    webAssetsDir,
    "fonts",
    "Merriweather-Italic-VariableFont.woff2"
  )

  if (fs.existsSync(regularPath)) {
    const b64 = fs.readFileSync(regularPath).toString("base64")
    rules.push(`@font-face {
  font-family: 'Merriweather';
  src: url('data:font/woff2;base64,${b64}') format('woff2');
  font-weight: 300 800;
  font-style: normal;
  font-display: swap;
}`)
  }

  if (fs.existsSync(italicPath)) {
    const b64 = fs.readFileSync(italicPath).toString("base64")
    rules.push(`@font-face {
  font-family: 'Merriweather';
  src: url('data:font/woff2;base64,${b64}') format('woff2');
  font-weight: 300 800;
  font-style: italic;
  font-display: swap;
}`)
  }

  rules.push(`body, p, h1, h2, h3, h4, h5, h6, span, div, button, input, textarea, select {
  font-family: "Merriweather", serif;
}`)

  return rules.join("\n")
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
