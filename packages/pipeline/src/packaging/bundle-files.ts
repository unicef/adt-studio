import fs from "node:fs"
import path from "node:path"
import { Parser } from "htmlparser2"
import { PublicationPageEntry } from "@adt/types"

/** A normalized locale becomes one directory name in a generated bundle. */
export const isBundleLocale = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value)

/** Validate the files required to open the generated reader. This is separate
 * from source freshness and source coverage: a valid partial bundle can still
 * be cached with its omission warnings. Never follow a bundle path outside it. */
export function packageFilesAvailable(adtDir: string, options: { format?: "web" | "scorm"; expectedLanguages?: readonly string[] } = {}): boolean {
  try {
    const root = fs.realpathSync(adtDir)
    const readFiles = new Map<string, string>()
    const read = (relative: string): string => {
      const requested = path.resolve(root, relative)
      const resolved = fs.realpathSync(requested)
      // The ZIP enumerator does not materialize symbolic links, even when
      // their targets are inside the bundle (including directory aliases).
      if (requested !== resolved) throw new Error("Bundle path absent from ZIP")
      const cached = readFiles.get(resolved)
      if (cached !== undefined) return cached
      if (!resolved.startsWith(root + path.sep) || !fs.statSync(resolved).isFile()) throw new Error("Invalid bundle file")
      const content = fs.readFileSync(resolved, "utf8")
      if (!content.length) throw new Error("Empty bundle file")
      readFiles.set(resolved, content)
      return content
    }
    const pages = PublicationPageEntry.array().nonempty().parse(JSON.parse(read("content/pages.json")))
    read("index.html")
    read("content/navigation/nav.html")
    JSON.parse(read("content/toc.json"))
    const config = JSON.parse(read("assets/config.json"))
    const languages: unknown = config?.languages?.available
    if (!Array.isArray(languages) || !languages.length || !languages.includes(config.languages.default) ||
        options.expectedLanguages?.some(language => !languages.includes(language))) return false
    for (const language of languages) {
      if (!isBundleLocale(language)) return false
      // These dictionaries are written even when empty and are loaded on
      // demand by the reader. Voice, glossary and timing files are conditional.
      for (const name of ["texts", "speech_texts", "audios", "videos", "images"]) {
        const data = JSON.parse(read(`content/i18n/${language}/${name}.json`))
        if (data === null || typeof data !== "object" || Array.isArray(data)) return false
      }
    }
    if (options.format === "scorm") {
      const members = new Set<string>()
      let launch = false
      new Parser({ onopentag(name, attrs) {
        if (name === "resource" && attrs.href === "index.html" && attrs["adlcp:scormtype"] === "sco") launch = true
        if (name === "file" && attrs.href) { read(attrs.href); members.add(attrs.href) }
      } }, { xmlMode: true }).end(read("imsmanifest.xml"))
      if (!launch || !members.has("index.html") || pages.some(page => !members.has(page.href))) return false
    }
    const seen = new Set<string>()
    for (const page of pages) {
      if (!page || typeof page.href !== "string" || typeof page.section_id !== "string" ||
        path.basename(page.href) !== page.href || page.href !== page.section_id + ".html" || seen.has(page.href)) return false
      seen.add(page.href)
      const html = read(page.href)
      const parser = new Parser({ onopentag(name, attributes) {
        const reference = name === "script" ? attributes.src
          : name === "link" && attributes.rel?.split(/\s+/).includes("stylesheet") ? attributes.href : undefined
        if (!reference || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference)) return
        read(decodeURIComponent(reference.split(/[?#]/)[0]))
      } })
      parser.end(html)
    }
    return fs.readdirSync(root).every(name => !name.endsWith(".html") || name === "index.html" || seen.has(name))
  } catch { return false }
}
