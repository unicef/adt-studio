import fs from "node:fs"
import path from "node:path"
import { Parser } from "htmlparser2"
import { cssReferences, parseCssSource } from "./css-references.js"
import { PublicationPageEntry } from "@adt/types"

/** A normalized locale becomes one directory name in a generated bundle. */
export const isBundleLocale = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value)

const proofs = new Map<string, Map<string, string>>()

/** Follow HTML's srcset token boundaries: commas inside a URL (notably data
 * URLs) belong to it; commas between descriptors start the next candidate. */
function srcsetUrls(value: string): string[] {
  const urls: string[] = []
  const space = (char: string) => /[\t\n\f\r ]/.test(char)
  let position = 0
  while (position < value.length) {
    while (position < value.length && (space(value[position]) || value[position] === ",")) position++
    const start = position
    while (position < value.length && !space(value[position])) position++
    const url = value.slice(start, position)
    if (!url) break
    urls.push(url.replace(/,+$/, ""))
    if (url.endsWith(",")) continue
    let parentheses = 0
    while (position < value.length) {
      const char = value[position++]
      if (char === "(") parentheses++
      else if (char === ")" && parentheses) parentheses--
      else if (char === "," && !parentheses) break
    }
  }
  return urls
}

function stamp(file: string): string {
  const stat = fs.lstatSync(file, { bigint: true })
  if (stat.isSymbolicLink()) throw new Error("Bundle symlink is absent from ZIP")
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":")
}

/** Validate the files required to open the generated reader. This is separate
 * from source freshness and source coverage: a valid partial bundle can still
 * be cached with its omission warnings. Never follow a bundle path outside it. */
export function packageFilesAvailable(adtDir: string, options: { format?: "web" | "scorm"; expectedLanguages?: readonly string[] } = {}): boolean {
  try {
    const root = fs.realpathSync(adtDir)
    const key = JSON.stringify([root, options.format, options.expectedLanguages])
    const hit = proofs.get(key)
    if (hit && [...hit].every(([file, identity]) => stamp(file) === identity)) return true
    proofs.delete(key)
    const dependencies = new Map<string, string>([[root, stamp(root)]])
    const readFiles = new Map<string, string>()
    const member = (relative: string): string => {
      const requested = path.resolve(root, relative)
      const resolved = fs.realpathSync(requested)
      // The ZIP enumerator does not materialize symbolic links, even when
      // their targets are inside the bundle (including directory aliases).
      if (requested !== resolved) throw new Error("Bundle path absent from ZIP")
      if (!resolved.startsWith(root + path.sep) || !fs.statSync(resolved).isFile() || !fs.statSync(resolved).size) throw new Error("Invalid bundle file")
      for (let file = resolved; file !== root; file = path.dirname(file)) dependencies.set(file, stamp(file))
      return resolved
    }
    const read = (relative: string): string => {
      const resolved = member(relative)
      const cached = readFiles.get(resolved)
      if (cached !== undefined) return cached
      if (!resolved.startsWith(root + path.sep) || !fs.statSync(resolved).isFile()) throw new Error("Invalid bundle file")
      const content = fs.readFileSync(resolved, "utf8")
      if (!content.length) throw new Error("Empty bundle file")
      readFiles.set(resolved, content)
      return content
    }
    const external = (url: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url.trim())
    const relativeMember = (url: string, from: string) => {
      url = url.trim()
      if (!url || external(url)) return undefined
      // A host-root URL cannot resolve inside a portable/offline package.
      // Do not let path.join reinterpret it as a bundle-relative member.
      const local = decodeURIComponent(url.split(/[?#]/)[0])
      if (local.startsWith("/") || local.includes("\\")) throw new Error("Root-absolute or nonportable bundle reference")
      return path.relative(root, member(path.join(path.dirname(from), local)))
    }
    const styles = new Map<string, ReturnType<typeof parseCssSource>>()
    const checkHtml = (html: string, from: string) => {
      const sources: Parameters<typeof cssReferences>[0][number][] = []
      const includedStyles = new Set<string>()
      const includeCss = (parsed: ReturnType<typeof parseCssSource>, base: string, inlineStyle?: string) => {
        for (const url of parsed.imports) includeStylesheet(url, base)
        sources.push({ parsed, from: base, inlineStyle })
      }
      const includeStylesheet = (url: string, base: string) => {
        const file = relativeMember(url, base)
        if (!file || includedStyles.has(file)) return
        includedStyles.add(file)
        let parsed = styles.get(file)
        if (!parsed) { parsed = parseCssSource(read(file)); styles.set(file, parsed) }
        includeCss(parsed, file)
      }
      let style: string | undefined
      new Parser({ onopentag(name, attrs) {
        if (name === "style") style = ""
        if (["script", "img", "audio", "video", "source", "track", "embed", "iframe"].includes(name) && attrs.src) relativeMember(attrs.src, from)
        if (name === "video" && attrs.poster) relativeMember(attrs.poster, from)
        if (name === "object" && attrs.data) relativeMember(attrs.data, from)
        if (name === "image" && (attrs.href || attrs["xlink:href"])) relativeMember(attrs.href ?? attrs["xlink:href"], from)
        if (name === "link" && attrs.rel?.split(/\s+/).includes("stylesheet") && attrs.href) includeStylesheet(attrs.href, from)
        if (attrs.style) includeCss(parseCssSource(attrs.style), from, attrs.style)
        if (attrs.srcset) for (const url of srcsetUrls(attrs.srcset)) relativeMember(url, from)
      }, ontext(text) { if (style !== undefined) style += text }, onclosetag(name) {
        if (name === "style" && style !== undefined) { includeCss(parseCssSource(style), from); style = undefined }
      } }).end(html)
      for (const reference of cssReferences(sources, html)) relativeMember(reference.url, reference.from)
    }
    const pages = PublicationPageEntry.array().nonempty().parse(JSON.parse(read("content/pages.json")))
    checkHtml(read("index.html"), "index.html")
    checkHtml(read("content/navigation/nav.html"), "content/navigation/nav.html")
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
        if (["audios", "videos", "images"].includes(name)) {
          const folder = name === "images" ? "images" : `content/i18n/${language}/${name === "audios" ? "audio" : "video"}`
          for (const file of Object.values(data)) {
            if (typeof file !== "string") return false
            relativeMember(file, folder + "/manifest.json")
          }
        }
      }
      const voices = `content/i18n/${language}/audio_voices.json`
      if (fs.existsSync(path.join(root, voices))) {
        const data = JSON.parse(read(voices))
        for (const slot of [data.primary, data.secondary]) for (const file of Object.values(slot?.audios ?? {})) {
          if (typeof file !== "string") return false
          relativeMember(file, `content/i18n/${language}/audio/manifest.json`)
        }
      }
      const glossary = `content/i18n/${language}/glossary.json`
      if (fs.existsSync(path.join(root, glossary))) {
        const entries: unknown = JSON.parse(read(glossary))
        if (!entries || typeof entries !== "object" || Array.isArray(entries)) return false
        for (const entry of Object.values(entries)) {
          if (!entry || typeof entry !== "object") return false
          for (const name of ["image", "video"] as const) {
            const file = (entry as Record<string, unknown>)[name]
            if (file !== undefined) {
              if (typeof file !== "string") return false
              relativeMember(file, "index.html")
            }
          }
        }
      }
    }
    if (options.format === "scorm") {
      const members = new Set<string>()
      let launch = false
      new Parser({ onopentag(name, attrs) {
        if (name === "resource" && attrs.href === "index.html" && attrs["adlcp:scormtype"] === "sco") launch = true
        if (name === "file" && attrs.href) { member(attrs.href); members.add(attrs.href) }
      } }, { xmlMode: true }).end(read("imsmanifest.xml"))
      if (!launch || !members.has("index.html") || pages.some(page => !members.has(page.href))) return false
    }
    const seen = new Set<string>()
    for (const page of pages) {
      if (!page || typeof page.href !== "string" || typeof page.section_id !== "string" ||
        path.basename(page.href) !== page.href || page.href !== page.section_id + ".html" || seen.has(page.href)) return false
      seen.add(page.href)
      const html = read(page.href)
      checkHtml(html, page.href)
    }
    if (!fs.readdirSync(root).every(name => !name.toLowerCase().endsWith(".html") || name === "index.html" || seen.has(name))) return false
    if (![...dependencies].every(([file, identity]) => stamp(file) === identity)) return false
    if (proofs.size >= 8) proofs.delete(proofs.keys().next().value!)
    proofs.set(key, dependencies)
    return true
  } catch { return false }
}
