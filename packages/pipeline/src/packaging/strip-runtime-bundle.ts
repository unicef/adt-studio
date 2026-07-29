import fs from "node:fs"
import path from "node:path"

const RUNTIME_ASSETS = [
  "base.bundle.min.js",
  "base.bundle.local.js",
  "base.bundle.min.js.map",
  "offline-preloader.js",
  "scorm.js",
]

const RUNTIME_SCRIPT_RE =
  /\s*<script\b[^>]*src=["'][^"']*(?:base\.bundle\.(?:min|local)\.js|offline-preloader\.js|scorm\.js)[^"']*["'][^>]*>\s*<\/script>/g

/**
 * Remove the embedded ADT runtime (React bundle, offline preloader, SCORM
 * adapter) — asset files and the `<script>` tags that load them — for formats
 * opened inside a host reader rather than standalone.
 */
export function stripRuntimeBundle(dir: string): void {
  for (const name of RUNTIME_ASSETS) {
    const p = path.join(dir, "assets", name)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && /\.(html|xhtml)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, "utf-8")
        const stripped = content.replace(RUNTIME_SCRIPT_RE, "")
        if (stripped !== content) fs.writeFileSync(fullPath, stripped)
      }
    }
  }
  walk(dir)
}
