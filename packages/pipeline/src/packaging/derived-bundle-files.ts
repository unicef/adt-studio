import fs from "node:fs"
import path from "node:path"
import { inspectReaderXml } from "./reader-xml.js"
import { DerivedWebpubFiles, PackageFileDiagnostic } from "@adt/types"
import { SectioningSafetyError } from "../sectioning-errors.js"
import { PACKAGE_OWNERS_FILE } from "./bundle-ownership.js"

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
      // Internal proof is excluded from reader ZIPs. A retained manifest that
      // declares it needs explicit preparation, never a dangling delivered href.
      if (path.basename(file) === PACKAGE_OWNERS_FILE) throw new Error("Internal reader member")
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
      return inspectReaderXml(read(href), element => {
        if (element.localName !== name || element.namespaceURI !== namespace) throw new Error("Invalid reader XML root")
        return inspect(element)
      })
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
        const files = new Map<string, { href: string; mediaType: string; overlay: string | null }>()
        for (const item of manifests[0].children) {
          const id = item.getAttribute("id"), href = item.getAttribute("href")
          if (item.localName !== "item" || item.namespaceURI !== publication.namespaceURI ||
              !id || !href || files.has(id)) throw new Error("Invalid manifest item")
          files.set(id, { href: member(href, prefix), mediaType: item.getAttribute("media-type") ?? "", overlay: item.getAttribute("media-overlay") })
        }
        const byHref = new Map([...files.values()].map(item => [item.href, item]))
        const documents = new Map<string, { ids: Set<string>; links: { href: string; kind: "text" | "audio" | "navigation" }[] }>()
        for (const item of files.values()) {
          const kind = item.mediaType === "application/xhtml+xml" || item.href.endsWith(".xhtml") ? "xhtml"
            : item.mediaType === "application/x-dtbncx+xml" || item.href.endsWith(".ncx") ? "ncx"
            : item.mediaType === "application/smil+xml" || item.href.endsWith(".smil") ? "smil" : undefined
          if (!kind || documents.has(item.href)) continue
          const [name, namespace] = kind === "xhtml" ? ["html", "http://www.w3.org/1999/xhtml"]
            : kind === "ncx" ? ["ncx", "http://www.daisy.org/z3986/2005/ncx/"] : ["smil", "http://www.w3.org/ns/SMIL"]
          documents.set(item.href, xml(item.href, name, namespace, root => {
            const elements = [root, ...root.getElementsByTagName("*")]
            const ids = new Set(elements.flatMap(element => element.hasAttribute("id") ? [element.getAttribute("id")!] : []))
            const links: { href: string; kind: "text" | "audio" | "navigation" }[] = []
            if (kind === "ncx") for (const content of root.getElementsByTagNameNS(namespace, "content")) {
              links.push({ href: content.getAttribute("src") ?? "", kind: "navigation" })
            }
            if (kind === "smil") for (const element of elements) {
              if (element.namespaceURI !== namespace) continue
              if (element.localName === "text" || element.localName === "audio") links.push({ href: element.getAttribute("src") ?? "", kind: element.localName })
              const textref = element.getAttributeNS("http://www.idpf.org/2007/ops", "textref")
              if (textref !== null) links.push({ href: textref, kind: "text" })
            }
            return { ids, links }
          }))
        }
        const overlayOwners = new Map<string, Set<string>>()
        document = path.join(prefix, "content.opf")
        for (const item of files.values()) if (item.overlay !== null) {
          const overlay = files.get(item.overlay)
          if (item.mediaType !== "application/xhtml+xml" || !overlay || overlay.mediaType !== "application/smil+xml") throw new Error("Undeclared media overlay")
          const links = documents.get(overlay.href)?.links ?? []
          if (!links.some(link => link.kind === "text") || !links.some(link => link.kind === "audio")) throw new Error("Empty media overlay")
          const owners = overlayOwners.get(overlay.href) ?? new Set<string>()
          owners.add(item.href); overlayOwners.set(overlay.href, owners)
        }
        for (const [href, parsed] of documents) for (const link of parsed.links) {
          document = href
          const target = member(link.href, path.dirname(href))
          const declared = byHref.get(target)
          if (!declared || (link.kind === "audio" ? !declared.mediaType.startsWith("audio/")
            : !["application/xhtml+xml", ...(format === "pnld" ? ["text/html"] : [])].includes(declared.mediaType))) {
            lastMember = link.href; throw new Error("Undeclared media/navigation target")
          }
          if (link.kind === "text" && overlayOwners.has(href) && !overlayOwners.get(href)!.has(target)) {
            lastMember = link.href; throw new Error("Media overlay belongs to another page")
          }
          const fragment = link.href.includes("#") ? decodeURIComponent(link.href.slice(link.href.indexOf("#") + 1)) : ""
          if (fragment && documents.has(target) && !documents.get(target)!.ids.has(fragment)) {
            lastMember = link.href; throw new Error("Missing reader fragment")
          }
        }
        document = path.join(prefix, "content.opf")
        const toc = spines[0].getAttribute("toc")
        if (toc !== null && files.get(toc)?.mediaType !== "application/x-dtbncx+xml") throw new Error("Undeclared NCX")
        return [...spines[0].children].map(item => {
          const id = item.getAttribute("idref"), file = id && files.get(id)
          if (item.localName !== "itemref" || item.namespaceURI !== publication.namespaceURI || !file ||
              !["application/xhtml+xml", ...(format === "pnld" ? ["text/html"] : [])].includes(file.mediaType)) throw new Error("Undeclared spine member")
          return file.href
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
