import fs from "node:fs"
import path from "node:path"
import { Parser } from "htmlparser2"
import { DerivedWebpubFiles, PackageFileDiagnostic } from "@adt/types"
import { SectioningSafetyError } from "../sectioning-errors.js"

/** Derived formats rewrite HTML and relocate resources. Validate their own
 * manifest and spine, rather than comparing converted bytes with ADT hashes. */
export function assertDerivedPackageFilesAvailable(directory: string, format: "webpub" | "epub" | "pnld", sectionIds: readonly string[]): void {
  let document: string | undefined, lastMember: string | undefined
  try {
    if (!fs.lstatSync(directory).isDirectory()) throw new Error("Invalid reader directory")
    const root = fs.realpathSync(directory)
    const member = (href: string, base = ""): string => {
      lastMember = href
      if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) throw new Error("Invalid local reader member")
      const local = decodeURIComponent(href.split(/[?#]/)[0])
      if (!local || local.startsWith("/") || local.includes("\\")) throw new Error("Nonportable reader member")
      const file = path.resolve(root, base, local)
      // ZIP traversal omits symlinks; even an internal alias cannot prove a
      // downloadable member. Reject missing, empty and directory substitutes.
      if (!file.startsWith(root + path.sep) || fs.realpathSync(file) !== file ||
          !fs.statSync(file).isFile() || !fs.statSync(file).size) throw new Error("Unavailable reader member")
      return path.relative(root, file)
    }
    const read = (href: string) => {
      document = href
      return fs.readFileSync(path.join(root, member(href)), "utf8")
    }
    const expected = sectionIds.map(id => format === "epub" ? `OEBPS/${id}.xhtml` : format === "pnld" ? `content/${id}.html` : `${id}.html`)
    let readingOrder: string[]
    if (format === "webpub") {
      const manifest = DerivedWebpubFiles.parse(JSON.parse(read("manifest.json")))
      readingOrder = manifest.readingOrder.map(entry => member(entry.href))
      for (const entry of manifest.resources) member(entry.href)
    } else {
      const prefix = format === "epub" ? "OEBPS" : ""
      if (format === "epub") {
        if (read("mimetype") !== "application/epub+zip") throw new Error("Invalid EPUB mimetype")
        let containerValid = false
        new Parser({ onopentag(name, attrs) {
          if (name === "rootfile" && attrs["full-path"] === "OEBPS/content.opf") containerValid = true
        } }, { xmlMode: true }).end(read("META-INF/container.xml"))
        if (!containerValid) throw new Error("Missing EPUB rootfile")
      }
      const files = new Map<string, string>(), spine: string[] = [], stack: string[] = []
      let closedManifest = false, closedSpine = false, closedPackage = false
      new Parser({ onopentag(name, attrs) {
        const parent = stack.at(-1)
        stack.push(name)
        if (name === "item" && parent === "manifest") {
          if (!attrs.id || !attrs.href || files.has(attrs.id)) throw new Error("Invalid manifest item")
          files.set(attrs.id, member(attrs.href, prefix))
        }
        if (name === "itemref" && parent === "spine") {
          if (!attrs.idref) throw new Error("Invalid spine item")
          spine.push(attrs.idref)
        }
      }, onclosetag(name) {
        if (stack.pop() !== name) throw new Error("Invalid reader structure")
        if (name === "manifest") closedManifest = true
        if (name === "spine") closedSpine = true
        if (name === "package") closedPackage = true
      } }, { xmlMode: true }).end(read(path.join(prefix, "content.opf")))
      if (!closedPackage || !closedManifest || !closedSpine || stack.length || !spine.length) throw new Error("Incomplete reader structure")
      readingOrder = spine.map(id => {
        const href = files.get(id)
        if (!href) throw new Error("Undeclared spine member")
        return href
      })
    }
    const declared = new Set(readingOrder)
    if (declared.size !== readingOrder.length || expected.some(href => !declared.has(member(href)))) {
      throw new Error("Missing declared reader document")
    }
  } catch {
    const diagnostic = PackageFileDiagnostic.safeParse({ document, member: lastMember })
    throw new SectioningSafetyError("PACKAGE_FILES_INCOMPLETE", JSON.stringify(diagnostic.success ? diagnostic.data : {}))
  }
}
