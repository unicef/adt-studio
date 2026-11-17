import fs from "node:fs"
import path from "node:path"
import { Parser } from "htmlparser2"
import { cssReferences, parseCssSource } from "./css-references.js"
import { PackageFileDiagnostic, PublicationPageEntry, PackagedAudioVoices } from "@adt/types"
import { SectioningSafetyError } from "../sectioning-errors.js"
import { inspectReaderXml } from "./reader-xml.js"
import { PACKAGE_OWNERS_FILE } from "./bundle-ownership.js"

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

/** A content resource a bundle document refers to but the bundle lacks. */
export interface MissingPackageAsset { document?: string; reference: string }

export interface PackageFilesOptions {
  format?: "web" | "scorm"
  expectedLanguages?: readonly string[]
  cachedOnly?: boolean
  onFailure?: (diagnostic: PackageFileDiagnostic) => void
  /** Accept a bundle whose book content refers to resources it does not
   * contain (images, media, fonts, linked styles inside a page body). The
   * files the reader needs to open (page documents, manifests, dictionaries,
   * scripts and the page shell's stylesheets) stay required. */
  allowMissingAssets?: boolean
  /** Use the build's CSS syntax tolerance without accepting missing resources.
   * Cache validation uses this even when a build reported no missing assets. */
  allowUnreadableStyles?: boolean
  /** Implies `allowMissingAssets` and reports each such resource. The check
   * then always runs in full, so every call reports the complete list. */
  onMissingAsset?: (asset: MissingPackageAsset) => void
}

/** Validate the files required to open the generated reader. This is separate
 * from source freshness and source coverage: a valid partial bundle can still
 * be cached with its omission warnings. Never follow a bundle path outside it. */
export function packageFilesAvailable(adtDir: string, options: PackageFilesOptions = {}): boolean {
  let document: string | undefined, lastMember: string | undefined
  const tolerant = options.allowMissingAssets === true || options.onMissingAsset !== undefined
  const allowUnreadableStyles = tolerant || options.allowUnreadableStyles === true
  const fail = () => {
    // A nonportable member must not erase a valid originating document.
    const source = PackageFileDiagnostic.shape.document.safeParse(document)
    const member = PackageFileDiagnostic.shape.member.safeParse(lastMember)
    options.onFailure?.({ ...(source.success && source.data ? { document: source.data } : {}),
      ...(member.success && member.data ? { member: member.data } : {}) })
    return false
  }
  try {
    const root = fs.realpathSync(adtDir)
    const key = JSON.stringify([root, options.format, options.expectedLanguages, tolerant, allowUnreadableStyles])
    const hit = proofs.get(key)
    // A removed dependency invalidates the proof; continue the cold check to
    // identify its originating document instead of swallowing stat errors.
    // A caller collecting missing assets needs the full pass to hear them all.
    try { if (!options.onMissingAsset && hit && [...hit].every(([file, identity]) => stamp(file) === identity)) return true } catch { /* recheck below */ }
    proofs.delete(key)
    // Library summaries may reuse a current proof, but never cold-verify all
    // documents while enumerating books. Unknown is not complete.
    if (options.cachedOnly) return fail()
    const dependencies = new Map<string, string>([[root, stamp(root)]])
    const readFiles = new Map<string, string>()
    const member = (relative: string): string => {
      lastMember = relative
      const requested = path.resolve(root, relative)
      if (path.basename(requested) === PACKAGE_OWNERS_FILE) throw new Error("Internal reader member")
      if (!requested.startsWith(root + path.sep)) throw new Error("Bundle path escapes root")
      const resolved = fs.realpathSync(requested)
      // The ZIP enumerator does not materialize symbolic links, even when
      // their targets are inside the bundle (including directory aliases).
      if (requested !== resolved) throw new Error("Bundle path absent from ZIP")
      if (!resolved.startsWith(root + path.sep) || !fs.statSync(resolved).isFile() || !fs.statSync(resolved).size) throw new Error("Invalid bundle file")
      for (let file = resolved; file !== root; file = path.dirname(file)) dependencies.set(file, stamp(file))
      lastMember = undefined
      return resolved
    }
    const read = (relative: string, preserveDocument = false): string => {
      if (!preserveDocument) document = relative
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
      lastMember = url
      const local = decodeURIComponent(url.split(/[?#]/)[0])
      if (local.startsWith("/") || local.includes("\\")) throw new Error("Root-absolute or nonportable bundle reference")
      return path.relative(root, member(path.join(path.dirname(from), local)))
    }
    // Book content may point at a resource the bundle does not have. That
    // leaves a gap on one page; it does not stop the reader from opening.
    const missingAsset = (reference: string) => {
      const source = PackageFileDiagnostic.shape.document.safeParse(document)
      options.onMissingAsset?.({ ...(source.success && source.data ? { document: source.data } : {}), reference: reference.trim().slice(0, 512) })
      lastMember = undefined
    }
    const asset = (url: string, from: string) => {
      if (!tolerant) return relativeMember(url, from)
      try { return relativeMember(url, from) } catch { missingAsset(url); return undefined }
    }
    const styles = new Map<string, ReturnType<typeof parseCssSource> | null>()
    const checkHtml = (html: string, from: string) => {
      document = from
      const sources: Parameters<typeof cssReferences>[0][number][] = []
      const includedStyles = new Set<string>()
      // `content`: reached from the page body (book content) rather than the
      // page shell in <head>. Only content may have gaps in tolerant mode.
      const includeCss = (parsed: ReturnType<typeof parseCssSource>, base: string, inlineStyle?: string, content = false) => {
        for (const url of parsed.imports) includeStylesheet(url, base, content)
        sources.push({ parsed, from: base, inlineStyle })
      }
      const includeStylesheet = (url: string, base: string, content = false) => {
        const optional = tolerant && content
        let file: string | undefined
        try { file = relativeMember(url, base) } catch (error) { if (!optional) throw error; missingAsset(url); return }
        if (!file || includedStyles.has(file)) return
        includedStyles.add(file)
        let parsed = styles.get(file)
        if (parsed === null) return
        if (!parsed) {
          // File admission remains strict for shell stylesheets, including
          // imported dependencies. Syntax errors alone do not stop the reader.
          let css: string
          try { css = read(file, true) }
          catch (error) { if (!optional) throw error; missingAsset(url); return }
          try { parsed = parseCssSource(css, "stylesheet") }
          catch (error) {
            if (!allowUnreadableStyles) { lastMember = file; throw error }
            styles.set(file, null)
            return
          }
          styles.set(file, parsed)
        }
        includeCss(parsed, file, undefined, content)
      }
      // Styles written inside book content. A browser ignores CSS it cannot
      // read, so in tolerant mode such a block contributes no references
      // rather than refusing the page it styles. Nothing is missing from the
      // bundle on its account, so there is nothing to report.
      const contentCss = (css: string, mode: true | "stylesheet", inlineStyle?: string, content = true) => {
        let parsed: ReturnType<typeof parseCssSource>
        try { parsed = parseCssSource(css, mode) }
        catch (error) { if (!allowUnreadableStyles) throw error; return }
        includeCss(parsed, from, inlineStyle, content)
      }
      let style: string | undefined, inBody = false
      new Parser({ onopentag(name, attrs) {
        if (name === "body") inBody = true
        if (name === "style") style = ""
        if (name === "script" && attrs.src) relativeMember(attrs.src, from)
        if (["img", "audio", "video", "source", "track", "embed", "iframe"].includes(name) && attrs.src) asset(attrs.src, from)
        if (name === "input" && attrs.type?.toLowerCase() === "image" && attrs.src) asset(attrs.src, from)
        if (name === "video" && attrs.poster) asset(attrs.poster, from)
        if (name === "object" && attrs.data) asset(attrs.data, from)
        if (["image", "use"].includes(name) && (attrs.href || attrs["xlink:href"])) asset(attrs.href ?? attrs["xlink:href"], from)
        if (name === "link" && attrs.rel?.toLowerCase().split(/\s+/).includes("stylesheet") && attrs.href) includeStylesheet(attrs.href, from, inBody)
        if (attrs.style) contentCss(attrs.style, true, attrs.style)
        if (attrs.srcset) for (const url of srcsetUrls(attrs.srcset)) asset(url, from)
      }, ontext(text) { if (style !== undefined) style += text }, onclosetag(name) {
        if (name === "style" && style !== undefined) {
          contentCss(style, "stylesheet", undefined, inBody)
          style = undefined
        }
      } }).end(html)
      let references: ReturnType<typeof cssReferences>
      try { references = cssReferences(sources, html) }
      catch (error) { if (!allowUnreadableStyles) throw error; lastMember = undefined; references = [] }
      // Every url() target is a resource (image, font), never reader code.
      for (const reference of references) asset(reference.url, reference.from)
    }
    const pages = PublicationPageEntry.array().nonempty().parse(JSON.parse(read("content/pages.json")))
    checkHtml(read("index.html"), "index.html")
    checkHtml(read("content/navigation/nav.html"), "content/navigation/nav.html")
    JSON.parse(read("content/toc.json"))
    const config = JSON.parse(read("assets/config.json"))
    const languages: unknown = config?.languages?.available
    if (!Array.isArray(languages) || !languages.length || !languages.includes(config.languages.default) ||
        options.expectedLanguages?.some(language => !languages.includes(language))) return fail()
    for (const language of languages) {
      if (!isBundleLocale(language)) return fail()
      // These dictionaries are written even when empty and are loaded on
      // demand by the reader. Voice, glossary and timing files are conditional.
      for (const name of ["texts", "speech_texts", "audios", "videos", "images"]) {
        const data = JSON.parse(read(`content/i18n/${language}/${name}.json`))
        if (data === null || typeof data !== "object" || Array.isArray(data)) return fail()
        if (["audios", "videos", "images"].includes(name)) {
          const folder = name === "images" ? "images" : `content/i18n/${language}/${name === "audios" ? "audio" : "video"}`
          for (const file of Object.values(data)) {
            if (typeof file !== "string") return fail()
            asset(file, folder + "/manifest.json")
          }
        }
      }
      const voices = `content/i18n/${language}/audio_voices.json`
      if (fs.existsSync(path.join(root, voices))) {
        const data = PackagedAudioVoices.parse(JSON.parse(read(voices)))
        for (const slot of Object.values(data.voices)) for (const file of Object.values(slot.audios)) {
          let narration: string | undefined
          try { narration = relativeMember(file, `content/i18n/${language}/audio/manifest.json`) }
          catch (error) { if (!tolerant) throw error; missingAsset(file); continue }
          if (!narration) return fail()
        }
      }
      const glossary = `content/i18n/${language}/glossary.json`
      if (fs.existsSync(path.join(root, glossary))) {
        const entries: unknown = JSON.parse(read(glossary))
        if (!entries || typeof entries !== "object" || Array.isArray(entries)) return fail()
        for (const entry of Object.values(entries)) {
          if (!entry || typeof entry !== "object") return fail()
          for (const name of ["image", "video"] as const) {
            const file = (entry as Record<string, unknown>)[name]
            if (file !== undefined) {
              if (typeof file !== "string") return fail()
              asset(file, "index.html")
            }
          }
        }
      }
    }
    const seen = new Set<string>()
    for (const page of pages) {
      if (!page || typeof page.href !== "string" || typeof page.section_id !== "string" ||
        path.basename(page.href) !== page.href || page.href !== page.section_id + ".html" || seen.has(page.href)) return fail()
      seen.add(page.href)
      const html = read(page.href)
      checkHtml(html, page.href)
    }
    if (options.format === "scorm") {
      const members = new Set<string>()
      let launch = false
      inspectReaderXml(read("imsmanifest.xml"), root => {
        const namespace = "http://www.imsproject.org/xsd/imscp_rootv1p1p2"
        if (root.localName !== "manifest" || root.namespaceURI !== namespace) throw new Error("Invalid SCORM manifest")
        const children = (parent: Element, name: string) => Array.from(parent.children).filter(child => child.localName === name && child.namespaceURI === namespace)
        for (const resources of children(root, "resources")) for (const resource of children(resources, "resource")) {
          if (resource.getAttribute("href") === "index.html" && resource.getAttributeNS("http://www.adlnet.org/xsd/adlcp_rootv1p2", "scormtype") === "sco") launch = true
          for (const file of children(resource, "file")) {
            const href = file.getAttribute("href")
            if (href) { member(href); members.add(href) }
          }
        }
      })
      if (!launch || !members.has("index.html") || pages.some(page => !members.has(page.href))) return fail()
    }
    if (!fs.readdirSync(root).every(name => !name.toLowerCase().endsWith(".html") || name === "index.html" || seen.has(name))) return fail()
    if (![...dependencies].every(([file, identity]) => stamp(file) === identity)) return fail()
    if (proofs.size >= 8) proofs.delete(proofs.keys().next().value!)
    proofs.set(key, dependencies)
    return true
  } catch { return fail() }
}

/** Same verifier and proof cache as status/Preview, with actionable failure for
 * explicit package preparation and downloads. The code-prefixed JSON survives
 * HTTP, persisted step messages and SSE without exposing filesystem exceptions. */
export function assertPackageFilesAvailable(adtDir: string, options: Pick<PackageFilesOptions, "format" | "expectedLanguages" | "allowMissingAssets" | "onMissingAsset"> = {}): void {
  let diagnostic: PackageFileDiagnostic = {}
  if (!packageFilesAvailable(adtDir, { ...options, onFailure: failure => { diagnostic = failure } })) {
    throw new SectioningSafetyError("PACKAGE_FILES_INCOMPLETE", JSON.stringify(diagnostic))
  }
}
