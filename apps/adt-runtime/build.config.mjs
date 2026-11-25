/**
 * Build the ADT runtime bundle (React + Jotai chrome + activity portals)
 * into the artifacts that apps/api and packages/pipeline expect:
 *
 *   assets/adt/base.bundle.local.js   (IIFE — for `<script src="...">`)
 *   assets/adt/base.bundle.min.js     (ESM — minified, with sourcemap)
 *   assets/adt/activities.bundle.local.js (IIFE — WebPub exports)
 *
 * The esbuild options live in build-options.mjs, which packages/pipeline also
 * uses to compile a book's reader source overrides (SPEC-0027), so the default
 * bundle and a customized one are built the same way.
 *
 * Also copies src/styles/globals.css → assets/adt/tailwind_css.css so the
 * per-book Tailwind v4 build (in package-web.ts) sees the canonical theme.
 */
import { build, context } from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runtimeBuildOptions } from "./build-options.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.resolve(__dirname, "../..")
const outDir = path.resolve(monorepoRoot, "assets/adt")
const globalsCss = path.join(__dirname, "src/styles/globals.css")

const watch = process.argv.includes("--watch")
const dev = process.argv.includes("--dev") || watch

fs.mkdirSync(outDir, { recursive: true })

const { esm, iife, activities } = runtimeBuildOptions({ dev, outDir })
const withLogging = (options) => ({ ...options, logLevel: "info" })

function copyTailwindEntry() {
  if (!fs.existsSync(globalsCss)) return
  fs.copyFileSync(globalsCss, path.join(outDir, "tailwind_css.css"))
}

copyTailwindEntry()
if (watch) {
  const contexts = await Promise.all([esm, iife, activities].map((options) => context(withLogging(options))))
  await Promise.all(contexts.map((ctx) => ctx.watch()))
  console.log("✓ adt-runtime: watching for changes")
} else {
  await Promise.all([esm, iife, activities].map((options) => build(withLogging(options))))
  console.log(`✓ adt-runtime: built → ${path.relative(monorepoRoot, outDir)}/base.bundle.{min,local}.js + activities.bundle.local.js`)
}
