import fs from "node:fs"
import path from "node:path"
import { JSDOM } from "jsdom"
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
      lastMember = undefined
      return path.relative(root, file)
    }
    const read = (href: string) => {
      document = href
      return fs.readFileSync(path.join(root, member(href)), "utf8")
    }
    const xml = <T>(href: string, name: string, namespace: string, inspect: (root: Element) => T): T => {
      // HTML tokenizers repair mismatched/truncated XML, including at EOF.
      // Use the existing strict XML parser; implied closures are not proof.
      const dom = new JSDOM(read(href), { contentType: "application/xml" })
      try {
        const element = dom.window.document.documentElement
        if (element.localName !== name || element.namespaceURI !== namespace) throw new Error("Invalid reader XML root")
        return inspect(element)
      } finally { dom.window.close() }
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
        xml("META-INF/container.xml", "container", "urn:oasis:names:tc:opendocument:xmlns:container", container => {
          const roots = container.getElementsByTagNameNS(container.namespaceURI, "rootfile")
          if (![...roots].some(file => file.getAttribute("full-path") === "OEBPS/content.opf" &&
              file.getAttribute("media-type") === "application/oebps-package+xml")) throw new Error("Missing EPUB rootfile")
        })
      }
      readingOrder = xml(path.join(prefix, "content.opf"), "package", "http://www.idpf.org/2007/opf", publication => {
        const children = (name: string) => [...publication.children].filter(element =>
          element.localName === name && element.namespaceURI === publication.namespaceURI)
        const manifests = children("manifest"), spines = children("spine")
        if (manifests.length !== 1 || spines.length !== 1 || !spines[0].children.length) throw new Error("Incomplete reader structure")
        const files = new Map<string, string>()
        for (const item of manifests[0].children) {
          const id = item.getAttribute("id"), href = item.getAttribute("href")
          if (item.localName !== "item" || item.namespaceURI !== publication.namespaceURI ||
              !id || !href || files.has(id)) throw new Error("Invalid manifest item")
          files.set(id, member(href, prefix))
        }
        return [...spines[0].children].map(item => {
          const id = item.getAttribute("idref"), href = id && files.get(id)
          if (item.localName !== "itemref" || item.namespaceURI !== publication.namespaceURI || !href) throw new Error("Undeclared spine member")
          return href
        })
      })
    }
    const declared = new Set(readingOrder)
    if (declared.size !== readingOrder.length || expected.some(href => !declared.has(member(href)))) {
      throw new Error("Missing declared reader document")
    }
  } catch {
    const source = PackageFileDiagnostic.shape.document.safeParse(document)
    const member = PackageFileDiagnostic.shape.member.safeParse(lastMember)
    throw new SectioningSafetyError("PACKAGE_FILES_INCOMPLETE", JSON.stringify({
      ...(source.success && source.data ? { document: source.data } : {}),
      ...(member.success && member.data ? { member: member.data } : {}),
    }))
  }
}
