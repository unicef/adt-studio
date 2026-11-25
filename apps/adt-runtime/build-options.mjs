import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const runtimeDir = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)))
const srcDir = path.join(runtimeDir, "src")
const RESOLVE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css", ".json"]
const COMPONENT_DECLARATION = /^(?:export\s+(?:default\s+)?)?(?:function\s+([A-Z][a-z]\w*)\s*[<(]|const\s+([A-Z][a-z]\w*)\b[^=]*=)/

export const ALLOWED_PACKAGES = [
  ...Object.keys(JSON.parse(fs.readFileSync(path.join(runtimeDir, "package.json"), "utf8")).dependencies ?? {}),
  "@adt/types",
]

export function isAllowedImport(specifier) {
  return ALLOWED_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`))
}

export function componentSourceTags(relativePath, contents) {
  const tags = []
  contents.split("\n").forEach((line, index) => {
    const match = COMPONENT_DECLARATION.exec(line)
    const name = match?.[1] ?? match?.[2]
    if (name) tags.push(`try{${name}.__adtSource=(globalThis.__adtSources??={})[${JSON.stringify(name)}]={path:${JSON.stringify(relativePath)},line:${index + 1}}}catch{}`)
  })
  return tags.length ? `\n;${tags.join(";")}\n` : ""
}

function toSrcRelative(absolutePath) {
  const relative = path.relative(srcDir, absolutePath)
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : relative.split(path.sep).join("/")
}

function loaderFor(file) {
  const ext = path.extname(file).slice(1)
  return ext === "css" ? "empty" : ext
}

function readerSourcePlugin(overlay) {
  const existsInSource = (relative) => overlay.has(relative) || fs.existsSync(path.join(srcDir, relative))
  const resolveSourceFile = (relative) => {
    const typescriptTwin = /\.jsx?$/.test(relative) ? [relative.replace(/\.js(x?)$/, ".ts$1")] : []
    const candidates = [relative, ...typescriptTwin, ...RESOLVE_EXTENSIONS.map((ext) => relative + ext), ...RESOLVE_EXTENSIONS.map((ext) => `${relative}/index${ext}`)]
    return candidates.find((candidate) => (overlay.has(candidate) || fs.statSync(path.join(srcDir, candidate), { throwIfNoEntry: false })?.isFile()))
  }

  return {
    name: "adt-reader-source",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return undefined
        const importerInSource = args.importer ? toSrcRelative(args.importer) !== null : false
        if (!importerInSource) return undefined
        const specifier = args.path
        const local = specifier.startsWith("@/") || specifier.startsWith(".")
        if (!local) {
          if (isAllowedImport(specifier)) return undefined
          return { errors: [{ text: `Import "${specifier}" is not allowed: only the reader's installed libraries can be used (${ALLOWED_PACKAGES.join(", ")}).` }] }
        }
        const target = specifier.startsWith("@/") ? path.join(srcDir, specifier.slice(2)) : path.resolve(args.resolveDir, specifier)
        const relative = toSrcRelative(target)
        if (relative === null) return { errors: [{ text: `Import "${specifier}" points outside the reader source.` }] }
        const file = resolveSourceFile(relative)
        if (!file) return { errors: [{ text: `Cannot find "${specifier}" in the reader source.` }] }
        return { path: path.join(srcDir, file) }
      })

      build.onLoad({ filter: /\.(tsx?|jsx?|css|json)$/ }, (args) => {
        const relative = toSrcRelative(args.path)
        if (relative === null || !existsInSource(relative)) return undefined
        const contents = overlay.get(relative) ?? fs.readFileSync(args.path, "utf8")
        const tags = relative.endsWith(".tsx") ? componentSourceTags(relative, contents) : ""
        return { contents: contents + tags, loader: loaderFor(relative), resolveDir: path.dirname(args.path) }
      })
    },
  }
}

export function runtimeBuildOptions({ dev = false, overlay = new Map(), outDir }) {
  const shared = {
    absWorkingDir: runtimeDir,
    entryPoints: [path.join(srcDir, "boot.tsx")],
    bundle: true,
    target: "es2020",
    jsx: "automatic",
    loader: { ".png": "dataurl", ".svg": "dataurl", ".woff2": "file", ".css": "empty" },
    define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
    plugins: [readerSourcePlugin(overlay)],
    logLevel: "silent",
  }
  return {
    esm: { ...shared, outfile: path.join(outDir, "base.bundle.min.js"), format: "esm", minify: !dev, sourcemap: true },
    iife: { ...shared, outfile: path.join(outDir, "base.bundle.local.js"), format: "iife", minify: !dev, globalName: "AdtRuntime", sourcemap: dev ? "inline" : false },
    activities: {
      ...shared,
      entryPoints: [path.join(srcDir, "activities-entry.tsx")],
      outfile: path.join(outDir, "activities.bundle.local.js"),
      format: "iife",
      minify: !dev,
      globalName: "AdtActivities",
      sourcemap: dev ? "inline" : false,
    },
  }
}

export async function buildReaderRuntime({ overlay, outDir }) {
  const { build } = await import("esbuild")
  const options = runtimeBuildOptions({ overlay, outDir })
  try {
    await Promise.all([build(options.esm), build(options.iife)])
    return { ok: true, errors: [] }
  } catch (error) {
    const messages = Array.isArray(error?.errors) ? error.errors : [{ text: String(error?.message ?? error) }]
    return {
      ok: false,
      errors: messages.map((message) => ({
        path: message.location ? (toSrcRelative(path.resolve(runtimeDir, message.location.file)) ?? message.location.file) : "",
        line: message.location?.line ?? 0,
        column: message.location?.column ?? 0,
        message: message.text,
      })),
    }
  }
}
