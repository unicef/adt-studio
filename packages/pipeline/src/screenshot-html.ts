/**
 * Build a self-contained HTML document from section HTML for screenshot rendering.
 *
 * - Rewrites image src paths to inline base64 data URIs
 * - Inlines Tailwind CSS (built from the section's class usage)
 * - Embeds Merriweather font files as base64 @font-face rules
 */
import fs from "node:fs"
import path from "node:path"
import { buildPreviewTailwindCss } from "./tailwind.js"
import { normalizeSectionRoles, promoteFirstHeadingToH1 } from "./html-semantics.js"

export interface BuildScreenshotHtmlOptions {
  /** The section HTML fragment (content inside <body>). */
  sectionHtml: string
  /** Book label, used to match image src paths for rewriting. */
  label: string
  /** Map of imageId → base64 data for inline embedding. */
  images: Map<string, { base64: string }>
  /** Path to the web assets directory (fonts, tailwind CSS entry, etc). */
  webAssetsDir: string
  /** HTML lang attribute. Defaults to "en". */
  language?: string
  /**
   * Book typography CSS (fixed size per text role). Appended to the compiled
   * Tailwind CSS so screenshot review sees the same fixed sizes the packaged
   * book uses — otherwise the reviewer would "correct" sizes that the final
   * bundle pins, causing drift.
   */
  typographyCss?: string
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
    typographyCss,
  } = options

  // Rewrite image src attributes to inline base64 data URIs
  const htmlWithInlineImages = normalizeSectionRoles(rewriteImageSrcs(sectionHtml, label, images))

  // Build Tailwind CSS from the section content
  const tailwindCss = await buildPreviewTailwindCss(
    htmlWithInlineImages,
    webAssetsDir,
    typographyCss
  )

  // Build inline font-face CSS with base64-encoded font files
  const fontCss = buildInlineFontCss(webAssetsDir)

  const normalizedHtml = promoteFirstHeadingToH1(htmlWithInlineImages)

  // Detect if the section contains FITB blank markers that need hydration
  const hasFitbMarkers = /\[\[blank:item-\d+/.test(normalizedHtml)

  const contentBlock = /^\s*<div\b[^>]*\bid="content"/.test(normalizedHtml)
    ? normalizedHtml
    : `<div id="content">
  ${normalizedHtml}
  </div>`

  return `<!DOCTYPE html>
<html lang="${escapeAttr(language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${tailwindCss}</style>
  <style>${fontCss}</style>
</head>
<body class="min-h-screen flex items-center justify-center">
  <main class="w-full">
    ${contentBlock}
  </main>
${hasFitbMarkers ? FITB_HYDRATION_SCRIPT : ""}
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

/**
 * Minimal inline script that hydrates [[blank:item-N]] markers into styled
 * <input> elements for screenshot rendering. This mirrors the runtime
 * hydrateFitbSentences() logic but without event listeners or accessibility
 * features — purely visual so the visual review LLM sees actual input fields.
 */
const FITB_HYDRATION_SCRIPT = `<script>
(function() {
  function replaceBlanks(html) {
    return html.replace(
      /\\[\\[blank:item-(\\d+)(?::([^\\]]+))?\\]\\]/g,
      function(_, itemNum, hint) {
        var charWidth = hint ? Math.max(hint.length + 2, 6) : 8;
        var valueAttr = hint ? ' placeholder="' + hint.replace(/"/g, '&quot;') + '"' : '';
        return '<input type="text"'
          + ' class="fitb-inline-input inline-block mx-1 px-1 py-0.5 border-b-2 border-gray-400 bg-transparent text-center"'
          + ' style="width: ' + charWidth + 'ch; min-width: 4ch; max-width: 100%;"'
          + ' data-activity-item="item-' + itemNum + '"'
          + valueAttr + ' />';
      }
    );
  }

  // Pass 1: replace inside [data-id] elements (the canonical text containers).
  var dataIdEls = document.querySelectorAll('[data-id]');
  dataIdEls.forEach(function(el) {
    if (el.innerHTML.indexOf('[[blank:') === -1) return;
    el.innerHTML = replaceBlanks(el.innerHTML);
  });

  // Pass 2: catch any remaining markers that appeared in plain wrapper elements
  // without their own data-id (text nodes directly inside <p>/<div>/<li>/<span>).
  // Walk all leaf-ish elements and only touch those still containing markers.
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    if (el.innerHTML.indexOf('[[blank:') === -1) continue;
    // Only rewrite if no descendant still contains the marker — process leaves only.
    var hasDescendantMarker = false;
    var children = el.children;
    for (var j = 0; j < children.length; j++) {
      if (children[j].innerHTML && children[j].innerHTML.indexOf('[[blank:') !== -1) {
        hasDescendantMarker = true;
        break;
      }
    }
    if (hasDescendantMarker) continue;
    el.innerHTML = replaceBlanks(el.innerHTML);
  }
})();
</script>`

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
