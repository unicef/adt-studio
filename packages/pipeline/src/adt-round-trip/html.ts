import { parseDocument, DomUtils } from "htmlparser2"
import type { ContentNodeData } from "@adt/types"

import { textContentExcludingScripts } from "../html-text.js"

export interface ImportedHtmlImageReference {
  imageId: string
  src: string
  alt: string
  decorative: boolean
}

export interface ImportedHtmlSectionProjection {
  html: string
  sectionType: string
  nodes: ContentNodeData[]
  images: ImportedHtmlImageReference[]
}

export interface ImportedHtmlProjectionOptions {
  /** Normalize stable IDs from known pre-round-trip Studio exports. This is
   * intentionally opt-in so current projects keep the strict contract. */
  repairLegacyIds?: boolean
  /** User-confirmed classification for an ambiguous imported section. */
  sectionTypeOverride?: string
}

export interface ImportedHtmlPresentationAssets {
  stylesheets: string[]
  scripts: string[]
  contentClasses: string[]
}

export type ImportedHtmlContractIssueCode =
  | "missing-content-root"
  | "multiple-content-roots"
  | "missing-section"
  | "multiple-sections"
  | "missing-section-type"
  | "missing-data-id"
  | "duplicate-data-id"
  | "image-missing-data-id"
  | "remote-asset"
  | "unsafe-asset"
  | "unsupported-stylesheet"
  | "unsupported-script"
  | "unsupported-asset-location"

export interface ImportedHtmlContractIssue {
  code: ImportedHtmlContractIssueCode
  detail?: string
}

export interface ImportedHtmlContractInspection {
  issues: ImportedHtmlContractIssue[]
  localAssets: string[]
  dataIds: string[]
}

export interface ImportedHtmlContractOptions {
  /** Generated quiz pages from older Studio versions identified their root
   * section with data-id instead of data-section-id. */
  allowSectionDataId?: boolean
  /** A fixed-layout page holds its absolutely-positioned leaves directly under
   * `#content` and has no semantic `<section>` to require — the positioning
   * context IS the wrapper. Data-id and asset rules still apply, so the page is
   * checked against them under `#content` instead. Callers decide with
   * `isImportedFixedLayoutPage`, so a genuinely broken reflowable page still
   * reports `missing-section`. */
  fixedLayoutPage?: boolean
}

const STANDARD_ADT_STYLESHEETS = new Set([
  "content/tailwind_output.css",
  "assets/libs/fontawesome/css/all.min.css",
  "assets/fonts.css",
])

const STANDARD_ADT_SCRIPTS = new Set([
  "assets/offline-preloader.js",
  "assets/scorm.js",
  "assets/base.bundle.local.js",
  "assets/base.bundle.min.js",
  "assets/auto-fit.js",
  "assets/activities.bundle.local.js",
])

const STANDARD_ADT_PRESENTATION_ASSETS = new Set([
  ...STANDARD_ADT_STYLESHEETS,
  ...STANDARD_ADT_SCRIPTS,
])

function normalizeImportedResource(value: string): string | null {
  let withoutSuffix = value.trim().split(/[?#]/, 1)[0]
  try { withoutSuffix = decodeURIComponent(withoutSuffix) } catch { return null }
  withoutSuffix = withoutSuffix.replace(/^\.\//, "")
  if (!withoutSuffix || /^(?:[a-z]+:|\/|\\)/i.test(withoutSuffix)) return null
  if (withoutSuffix.split("/").includes("..")) return null
  return withoutSuffix.split("/").filter((part) => part && part !== ".").join("/") || null
}

function isAllowedGoogleFontsLink(tag: string, rel: string, value: string): boolean {
  if (tag !== "link") return false
  if (rel.split(/\s+/).includes("preconnect")) {
    return value === "https://fonts.googleapis.com"
      || value === "https://fonts.gstatic.com"
  }
  return rel.split(/\s+/).includes("stylesheet")
    && /^https:\/\/fonts\.googleapis\.com\/css2\?/i.test(value)
}

/** Validate the stable HTML hooks ADT Studio needs to project an exported page
 * back into pipeline entities. This is deliberately a narrow contract: the
 * importer must reject unsupported page structures instead of guessing. */
export function inspectImportedHtmlContract(
  html: string,
  expectedSectionId: string,
  options: ImportedHtmlContractOptions = {},
): ImportedHtmlContractInspection {
  const doc = parseDocument(html)
  const issues: ImportedHtmlContractIssue[] = []
  const pageDataIds: string[] = []
  const contentRoots = DomUtils.findAll(
    (el) => el.type === "tag" && el.attribs?.id === "content",
    doc.children,
  )
  if (contentRoots.length === 0) issues.push({ code: "missing-content-root" })
  if (contentRoots.length > 1) issues.push({ code: "multiple-content-roots" })

  const matchingSections = options.fixedLayoutPage === true ? [] : DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "section"
      && (
        el.attribs?.["data-section-id"] === expectedSectionId
        || (options.allowSectionDataId === true && el.attribs?.["data-id"] === expectedSectionId)
      ),
    contentRoots[0]?.children ?? [],
  )
  if (options.fixedLayoutPage !== true) {
    if (matchingSections.length === 0) issues.push({ code: "missing-section", detail: expectedSectionId })
    if (matchingSections.length > 1) issues.push({ code: "multiple-sections", detail: expectedSectionId })
  }
  const section = matchingSections[0]
  if (section && !section.attribs["data-section-type"]?.trim()) {
    issues.push({ code: "missing-section-type", detail: expectedSectionId })
  }

  const dataIdRoot = options.fixedLayoutPage === true ? contentRoots[0] : section
  if (dataIdRoot) {
    const elements = [
      ...(section ? [section] : []),
      ...DomUtils.findAll((el) => el.type === "tag", dataIdRoot.children ?? []),
    ]
    const ids = new Set<string>()
    let dataIdCount = 0
    for (const element of elements) {
      if (element.type !== "tag") continue
      const dataId = element.attribs["data-id"]?.trim()
      if (dataId) {
        pageDataIds.push(dataId)
        dataIdCount++
        if (ids.has(dataId)) issues.push({ code: "duplicate-data-id", detail: dataId })
        ids.add(dataId)
      }
      if (
        element.name === "img"
        && !dataId
      ) {
        issues.push({ code: "image-missing-data-id", detail: element.attribs.src ?? "" })
      }
    }
    if (dataIdCount === 0) issues.push({ code: "missing-data-id", detail: expectedSectionId })
  }

  const localAssets = new Set<string>()
  const resourceElements = DomUtils.findAll(
    (el) => (el.type === "tag" || el.type === "script")
      && ["link", "script", "img", "source", "audio", "video"].includes(el.name),
    doc.children,
  )
  for (const element of resourceElements) {
    if (element.type !== "tag" && element.type !== "script") continue
    for (const attribute of element.name === "link"
      ? ["href"]
      : element.name === "video" ? ["src", "poster"] : ["src"]) {
      const value = element.attribs[attribute]?.trim()
      if (!value || value.startsWith("#") || value.startsWith("data:")) continue
      if (/^(?:https?:)?\/\//i.test(value)) {
        if (!isAllowedGoogleFontsLink(element.name, element.attribs.rel ?? "", value)) {
          issues.push({ code: "remote-asset", detail: value })
        }
      } else if (
        /^(?:[a-z]+:|\/|\\)/i.test(value)
        || value.split(/[?#]/, 1)[0].split("/").includes("..")
        || normalizeImportedResource(value) === null
      ) {
        issues.push({ code: "unsafe-asset", detail: value })
      } else {
        const normalized = normalizeImportedResource(value)
        if (!normalized) continue
        localAssets.add(normalized)
        if (
          element.name === "link"
          && (element.attribs.rel ?? "").split(/\s+/).includes("stylesheet")
          && !STANDARD_ADT_STYLESHEETS.has(normalized)
        ) {
          issues.push({ code: "unsupported-stylesheet", detail: value })
        } else if (element.name === "script" && !STANDARD_ADT_SCRIPTS.has(normalized)) {
          issues.push({ code: "unsupported-script", detail: value })
        } else if (
          ["img", "source", "audio", "video"].includes(element.name)
          && !normalized.startsWith("images/")
        ) {
          issues.push({ code: "unsupported-asset-location", detail: value })
        }
      }
    }
  }
  return { issues, localAssets: [...localAssets], dataIds: pageDataIds }
}

export const ADT_EDITING_ALLOWED_ROOT_ENTRIES = new Set([
  "assets",
  "content",
  "images",
  "manifest.json",
  "index.html",
  "cover.png",
  "cover.jpg",
  "cover.jpeg",
  "cover.webp",
  "AGENTS.md",
  "CLAUDE.md",
  "imsmanifest.xml",
  ".build-hash",
  ".build-version",
  ".DS_Store",
  "Thumbs.db",
  "__MACOSX",
])

function normalizeLocalPresentationAsset(value: string): string | null {
  const withoutSuffix = value.trim().split(/[?#]/, 1)[0].replace(/^\.\//, "")
  if (!withoutSuffix || /^(?:[a-z]+:|\/|\\)/i.test(withoutSuffix)) return null
  if (withoutSuffix.split("/").includes("..")) return null
  const normalized = withoutSuffix.split("/").reduce<string[]>((parts, part) => {
    if (!part || part === ".") return parts
    parts.push(part)
    return parts
  }, []).join("/")
  if (!normalized || normalized.startsWith("../") || STANDARD_ADT_PRESENTATION_ASSETS.has(normalized)) {
    return null
  }
  return normalized
}

/** Find local, non-runtime stylesheets and scripts linked by an imported ADT
 * page. These are presentation dependencies, not canonical book data. */
export function extractImportedHtmlPresentationAssets(
  html: string,
): ImportedHtmlPresentationAssets {
  const doc = parseDocument(html)
  const stylesheets = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "link"
      && (el.attribs?.rel ?? "").split(/\s+/).includes("stylesheet"),
    doc.children,
  ).map((el) => normalizeLocalPresentationAsset(el.attribs.href ?? ""))
    .filter((value): value is string => value !== null)
  const scripts = DomUtils.findAll(
    (el) => el.type === "script" && Boolean(el.attribs?.src),
    doc.children,
  ).map((el) => normalizeLocalPresentationAsset(el.attribs.src ?? ""))
    .filter((value): value is string => value !== null)
  const contentRoot = DomUtils.findOne(
    (el) => el.type === "tag" && el.attribs?.id === "content",
    doc.children,
    true,
  )
  const contentClasses = (contentRoot?.attribs?.class ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((className) => !/[<>"'`=\s]/.test(className))
    // Exported pages hide #content until their runtime finishes loading. The
    // editor and screenshot renderer do not execute that runtime, so retaining
    // these transient classes would make otherwise valid imported pages blank.
    .filter((className) => !["opacity-0", "invisible", "hidden"].includes(className))
  return {
    stylesheets: [...new Set(stylesheets)],
    scripts: [...new Set(scripts)],
    contentClasses: [...new Set(contentClasses)],
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function removeExecutableImportedMarkup(section: ReturnType<typeof DomUtils.findOne>): void {
  if (!section) return
  const executable = DomUtils.findAll(
    (el) => (el.type === "tag" || el.type === "script")
      && ["script", "iframe", "object", "embed", "base", "meta", "link"].includes(el.name ?? ""),
    section.children ?? [],
  )
  executable.forEach((element) => DomUtils.removeElement(element))

  const elements = [section, ...DomUtils.findAll(
    (el) => el.type === "tag",
    section.children ?? [],
  )]
  for (const element of elements) {
    if (element.type !== "tag") continue
    for (const [name, value] of Object.entries(element.attribs)) {
      if (/^on/i.test(name)) {
        delete element.attribs[name]
        continue
      }
      if (
        ["src", "href", "xlink:href", "action", "formaction"].includes(name.toLowerCase())
        && /^\s*(?:javascript:|data:text\/html)/i.test(value)
      ) {
        delete element.attribs[name]
      }
      if (name.toLowerCase() === "style" && /(?:expression\s*\(|javascript:)/i.test(value)) {
        delete element.attribs[name]
      }
    }
  }
}

/**
 * Normalize one exported ADT page document into the same section fragment and
 * minimal semantic leaves used by the regular Storyboard pipeline. The HTML
 * remains authoritative; the semantic tree is an adapter for features such as
 * TOC, Easy Read, quizzes, and the existing section editor.
 */
export function projectImportedHtmlSection(
  html: string,
  expectedSectionId: string,
  imageUrlPrefix?: string,
  options: ImportedHtmlProjectionOptions = {},
): ImportedHtmlSectionProjection {
  const doc = parseDocument(html)
  const sections = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "section",
    doc.children,
  )
  const section = sections.find((el) => el.attribs?.["data-section-id"] === expectedSectionId)
    ?? sections[0]
  if (!section) {
    const contentRoot = DomUtils.findOne(
      (el) => el.type === "tag" && el.attribs?.id === "content",
      doc.children,
      true,
    )
    const body = DomUtils.findOne(
      (el) => el.type === "tag" && el.name === "body",
      doc.children,
      true,
    )
    const content = contentRoot
      ? DomUtils.getInnerHTML(contentRoot)
      : body ? DomUtils.getInnerHTML(body) : DomUtils.getInnerHTML(doc)
    return projectImportedHtmlSection(
      `<section data-section-id="${escapeHtmlAttribute(expectedSectionId)}" data-section-type="content">${content}</section>`,
      expectedSectionId,
      imageUrlPrefix,
      options,
    )
  }

  section.attribs["data-section-id"] = expectedSectionId
  removeExecutableImportedMarkup(section)
  const sectionType = options.sectionTypeOverride
    ?? section.attribs["data-section-type"]?.trim()
    ?? "content"
  section.attribs["data-section-type"] = sectionType

  if (options.repairLegacyIds) {
    const elements = [section, ...DomUtils.findAll(
      (el) => el.type === "tag",
      section.children ?? [],
    )]
    const used = new Set<string>()
    for (const element of elements) {
      if (element.type !== "tag") continue
      const dataId = element.attribs["data-id"]?.trim()
      if (!dataId) continue
      if (used.has(dataId)) {
        let copy = 2
        while (used.has(`${dataId}_copy${copy}`)) copy++
        const repairedId = `${dataId}_copy${copy}`
        element.attribs["data-id"] = repairedId
        used.add(repairedId)
      } else {
        used.add(dataId)
      }
    }
    for (const element of elements) {
      if (element.type !== "tag" || element.name !== "img" || element.attribs["data-id"]) continue
      const source = element.attribs.src?.split(/[?#]/, 1)[0] ?? ""
      let decoded = source
      try { decoded = decodeURIComponent(source) } catch { /* keep the literal source */ }
      const fileName = decoded.split("/").pop() ?? ""
      const imageId = fileName.replace(/\.[a-zA-Z0-9]+$/, "")
      if (/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(imageId) && !used.has(imageId)) {
        element.attribs["data-id"] = imageId
        used.add(imageId)
      }
    }
  }

  const leaves = DomUtils.findAll(
    (el) =>
      el.type === "tag" &&
      el.attribs?.["data-id"] !== undefined &&
      !DomUtils.findOne(
        (child) => child.type === "tag" && child.attribs?.["data-id"] !== undefined,
        el.children ?? [],
        true,
      ),
    section.children ?? [],
  )
  const nodes: ContentNodeData[] = []
  const images: ImportedHtmlImageReference[] = []
  const seen = new Set<string>()
  for (const el of leaves) {
    const nodeId = el.attribs["data-id"]?.trim()
    if (!nodeId || seen.has(nodeId)) continue
    seen.add(nodeId)

    if (el.name === "img") {
      const src = el.attribs.src ?? ""
      const alt = (el.attribs.alt ?? "").trim()
      const decorative = el.attribs["aria-hidden"] === "true" || el.attribs.role === "presentation"
      images.push({ imageId: nodeId, src, alt, decorative })
      nodes.push({ nodeId, role: "image", isPruned: false })
      if (imageUrlPrefix) el.attribs.src = `${imageUrlPrefix}/${encodeURIComponent(nodeId)}`
      continue
    }

    const text = textContentExcludingScripts(el).replace(/\s+/g, " ").trim()
    if (!text) continue
    let cursor = el as typeof el | null
    let heading = false
    while (cursor) {
      if (/^h[1-6]$/i.test(cursor.name ?? "")) {
        heading = true
        break
      }
      if (cursor === section) break
      cursor = cursor.parent?.type === "tag" ? cursor.parent : null
    }
    nodes.push({
      nodeId,
      role: heading ? "heading" : "text",
      text,
      isPruned: false,
    })
  }

  return {
    html: DomUtils.getOuterHTML(section),
    sectionType,
    nodes,
    images,
  }
}

/** Build a non-executable visual reference for import review. The preview
 * preserves semantic structure and controls while removing every URL-bearing
 * or inline-style attribute so opening it cannot execute code or make network
 * requests. */
export function createSafeImportedHtmlPreview(
  html: string,
  expectedSectionId: string,
  resolveImageSource?: (path: string) => string | undefined,
): string {
  const projectedSection = projectImportedHtmlSection(html, expectedSectionId).html
  const previewDocument = parseDocument(projectedSection)
  const resourceAttributes = [
    "action",
    "formaction",
    "href",
    "poster",
    "src",
    "srcset",
    "style",
    "xlink:href",
  ]
  const elements = DomUtils.findAll(
    (element) => element.type === "tag",
    previewDocument.children,
  )
  for (const element of elements) {
    const rawImageSource = element.name === "img" ? element.attribs.src : undefined
    resourceAttributes.forEach((attribute) => delete element.attribs[attribute])
    if (rawImageSource) {
      let normalizedSource = rawImageSource.split(/[?#]/, 1)[0].replace(/^\.\//, "")
      try { normalizedSource = decodeURIComponent(normalizedSource) } catch { /* use literal path */ }
      const embeddedSource = resolveImageSource?.(normalizedSource)
      if (
        embeddedSource
        && /^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(embeddedSource)
      ) {
        element.attribs.src = embeddedSource
      }
    }
  }
  const section = DomUtils.getInnerHTML(previewDocument)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; color: #1e293b; background: #f8fafc; }
    section { min-height: calc(100vh - 64px); max-width: 780px; margin: 0 auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; box-shadow: 0 1px 2px rgb(15 23 42 / 0.05); }
    img, video, svg { max-width: 100%; height: auto; }
    button, input, select, textarea { font: inherit; }
    button, input:not([type="radio"]):not([type="checkbox"]), select, textarea { min-height: 36px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px; background: #ffffff; }
    label { display: inline-flex; align-items: center; gap: 8px; }
  </style>
</head>
<body>${section}</body>
</html>`
}
