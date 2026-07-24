/**
 * Build the ADT runtime bundle (React + Jotai chrome + activity portals)
 * into the two artifacts that apps/api and packages/pipeline expect:
 *
 *   assets/adt/base.bundle.local.js   (IIFE — for `<script src="...">`)
 *   assets/adt/base.bundle.min.js     (ESM — minified, with sourcemap)
 *
 * Also:
 *   - Copies src/styles/globals.css → assets/adt/tailwind_css.css so the
 *     per-book Tailwind v4 build (in package-web.ts) sees the canonical
 *     theme + utilities source.
 *
 * CSS handling: esbuild uses `loader: { ".css": "empty" }` — boot.tsx imports
 * globals.css for Vite dev, but in production CSS comes exclusively from the
 * per-book content/tailwind_output.css that packages/pipeline regenerates.
 * Emitting a CSS sidecar from the JS bundle would be unused and confusing.
 */
import { build, context } from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.resolve(__dirname, "../..")
const entry = path.join(__dirname, "src/boot.tsx")
const activitiesEntry = path.join(__dirname, "src/activities-entry.tsx")
const outDir = path.resolve(monorepoRoot, "assets/adt")
const globalsCss = path.join(__dirname, "src/styles/globals.css")

const watch = process.argv.includes("--watch")
const dev = process.argv.includes("--dev") || watch

fs.mkdirSync(outDir, { recursive: true })

const sharedOptions = {
  entryPoints: [entry],
  bundle: true,
  target: "es2020",
  jsx: "automatic",
  loader: {
    ".png": "dataurl",
    ".svg": "dataurl",
    ".woff2": "file",
    // Vite handles globals.css via @tailwindcss/vite; in production we don't
    // emit the CSS sidecar — per-book tailwind_output.css covers all styling.
    ".css": "empty",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
  },
  logLevel: "info",
}

const esmOptions = {
  ...sharedOptions,
  outfile: path.join(outDir, "base.bundle.min.js"),
  format: "esm",
  minify: !dev,
  sourcemap: true,
}

const iifeOptions = {
  ...sharedOptions,
  outfile: path.join(outDir, "base.bundle.local.js"),
  format: "iife",
  minify: !dev,
  globalName: "AdtRuntime",
  sourcemap: dev ? "inline" : false,
}

// Standalone activities bundle for WebPub exports (which strip the full
// runtime). IIFE so it loads via a plain `<script src>`.
const activitiesOptions = {
  ...sharedOptions,
  entryPoints: [activitiesEntry],
  outfile: path.join(outDir, "activities.bundle.local.js"),
  format: "iife",
  minify: !dev,
  globalName: "AdtActivities",
  sourcemap: dev ? "inline" : false,
}

/**
 * Mirror src/styles/globals.css → assets/adt/tailwind_css.css. This file is
 * the input for the per-book Tailwind v4 build run by packages/pipeline.
 * It contains `@import "tailwindcss"`, the shadcn `@theme inline {}` block,
 * and the legacy book-specific styles.
 */
function copyTailwindEntry() {
  if (!fs.existsSync(globalsCss)) return
  fs.copyFileSync(globalsCss, path.join(outDir, "tailwind_css.css"))
}

if (watch) {
  copyTailwindEntry()
  const [esmCtx, iifeCtx, activitiesCtx] = await Promise.all([
    context(esmOptions),
    context(iifeOptions),
    context(activitiesOptions),
  ])
  await Promise.all([esmCtx.watch(), iifeCtx.watch(), activitiesCtx.watch()])
  console.log("✓ adt-runtime: watching for changes")
} else {
  copyTailwindEntry()
  await Promise.all([build(esmOptions), build(iifeOptions), build(activitiesOptions)])
  console.log(`✓ adt-runtime: built → ${path.relative(monorepoRoot, outDir)}/base.bundle.{min,local}.js + activities.bundle.local.js`)
}
