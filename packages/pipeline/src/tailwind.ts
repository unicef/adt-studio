import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Tailwind v4 resolves `@import "tailwindcss"` relative to the postcss `from`
 * path. webAssetsDir / book directories don't have their own node_modules,
 * so we route the postcss invocation through this package's own directory
 * where tailwindcss + @tailwindcss/postcss are installed.
 */
const PIPELINE_PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const TAILWIND_VIRTUAL_FROM = path.join(PIPELINE_PACKAGE_DIR, "_tailwind_input.css")

export async function buildTailwindCss(
  adtDir: string,
  webAssetsDir: string,
  typographyCss?: string,
): Promise<void> {
  const outputPath = path.join(adtDir, "content", "tailwind_output.css")
  // The .adt-* rules live in @layer components, so they default the role sizes
  // while element-level text-* utilities (utilities layer) keep priority.
  const suffix = typographyCss ? `\n${typographyCss}\n` : ""

  // In Tauri sidecar mode, postcss/tailwindcss cannot run inside the pkg binary.
  // bundle.mjs pre-builds tailwind_output.css into webAssetsDir before zipping.
  const preBuilt = path.join(webAssetsDir, "tailwind_output.css")
  if (fs.existsSync(preBuilt)) {
    fs.copyFileSync(preBuilt, outputPath)
    if (suffix) fs.appendFileSync(outputPath, suffix)
    return
  }

  // Dynamic imports to avoid issues if not installed
  const postcss = (await import("postcss")).default
  // @tailwindcss/postcss is the Tailwind v4 plugin. Theme/colors live in CSS
  // (tailwind_css.css → globals.css) via the @theme inline directive, so the
  // plugin needs no JS-side config.
  const tailwindcss = (await import("@tailwindcss/postcss")).default

  const inputCssPath = path.join(webAssetsDir, "tailwind_css.css")
  const inputCss = fs.existsSync(inputCssPath)
    ? fs.readFileSync(inputCssPath, "utf-8")
    : '@import "tailwindcss";'

  // Inject content sources via @source directives. Tailwind v4 scans only
  // files on disk, so compiled chrome bundles + book HTML files are
  // referenced by absolute path.
  const sourceDirectives = [
    `@source "${toPosix(path.join(adtDir, "**/*.html"))}";`,
    `@source "${toPosix(path.join(adtDir, "**/*.js"))}";`,
  ].join("\n")

  const result = await postcss([tailwindcss({ base: adtDir })]).process(
    `${sourceDirectives}\n${inputCss}`,
    { from: TAILWIND_VIRTUAL_FROM },
  )

  fs.writeFileSync(outputPath, result.css + suffix)
}

/** Convert Windows backslashes to forward slashes for `@source` paths. */
function toPosix(p: string): string {
  return p.replace(/\\/g, "/")
}

/**
 * Build Tailwind CSS for preview and return the CSS string.
 * Scans the given content HTML plus all web asset files for used classes.
 */
export async function buildPreviewTailwindCss(
  contentHtml: string,
  webAssetsDir: string,
  typographyCss?: string,
): Promise<string> {
  const postcss = (await import("postcss")).default
  const tailwindcss = (await import("@tailwindcss/postcss")).default

  const inputCssPath = path.join(webAssetsDir, "tailwind_css.css")
  const inputCss = fs.existsSync(inputCssPath)
    ? fs.readFileSync(inputCssPath, "utf-8")
    : '@import "tailwindcss";'

  // Tailwind v4 scans files on disk only — there's no equivalent to v3's
  // `content: [{ raw, extension }]`. For dynamic content (HTML built from
  // the DB rows), write to a temp file and reference it via @source.
  // For chrome classes, scan apps/adt-runtime/src directly so JSX class
  // strings are picked up before they get minified into the bundle.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-twv4-"))
  const tempHtml = path.join(tempDir, "preview-content.html")
  fs.writeFileSync(tempHtml, contentHtml)

  const sourceDirectives = [
    `@source "${toPosix(tempHtml)}";`,
    `@source "${toPosix(path.resolve(webAssetsDir, "../../apps/adt-runtime/src"))}";`,
    `@source "${toPosix(path.join(webAssetsDir, "base.bundle.min.js"))}";`,
  ].join("\n")

  try {
    const result = await postcss([tailwindcss({ base: webAssetsDir })]).process(
      `${sourceDirectives}\n${inputCss}`,
      { from: TAILWIND_VIRTUAL_FROM },
    )
    // .adt-* size rules ship in @layer components — text-* utilities keep priority.
    return typographyCss ? `${result.css}\n${typographyCss}\n` : result.css
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
