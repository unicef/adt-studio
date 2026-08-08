import { createHash } from "node:crypto"

import { unzipSync } from "fflate"
import { z, type ZodType } from "zod"
import {
  AdtBundleGlossary,
  AdtBundleTexts,
  AdtBundleToc,
  AdtRoundTripManifest,
} from "@adt/types"
import type {
  AdtBundleGlossary as AdtBundleGlossaryData,
  AdtBundleTexts as AdtBundleTextsData,
  AdtBundleToc as AdtBundleTocData,
  AdtRoundTripManifest as AdtRoundTripManifestData,
} from "@adt/types"
import { canonicalJson } from "@adt/types/fingerprint"

export const ADT_BUNDLE_READER_LIMITS = {
  archiveBytes: 100 * 1024 * 1024,
  entries: 10_000,
  manifestBytes: 1024 * 1024,
  jsonBytes: 10 * 1024 * 1024,
  htmlBytes: 20 * 1024 * 1024,
  selectedBytes: 100 * 1024 * 1024,
} as const

export class AdtBundleReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdtBundleReadError"
  }
}

/** The archive has none of the stable files that identify an exported ADT.
 * Callers may safely try another importer only for this specific case. */
export class AdtBundleNotDetectedError extends AdtBundleReadError {
  constructor() {
    super("Archive is not an exported ADT bundle")
    this.name = "AdtBundleNotDetectedError"
  }
}

export interface AdtBundleIgnoredEdits {
  sourceTextsChanged: boolean
  pageHtmlChanged: string[]
  pageHtmlMissing: string[]
}

export interface ReadAdtBundle {
  root: string
  sourceFormat: "round-trip" | "legacy-studio-export"
  manifest: AdtRoundTripManifestData
  title: string
  cover: { bytes: Uint8Array; mimeType: string } | null
  pageCount: number
  pages: Array<{ section_id: string; href: string; page_number?: number }>
  pageHtml: Record<string, string>
  runtimeFeatures: Record<string, boolean>
  toc: AdtBundleTocData
  glossaries: Record<string, AdtBundleGlossaryData>
  texts: Record<string, AdtBundleTextsData>
  ignoredEdits: AdtBundleIgnoredEdits
  agentGuides: {
    agentsMd: string | null
    claudeMd: string | null
  }
  /** Canonical raster assets included only for the pre-import visual review. */
  previewImages?: Record<string, { bytes: Uint8Array; mimeType: string }>
}

const MANIFEST_PATH = /^(?:[^/]+\/)?manifest\.json$/
const TOC_PATH = /^(?:[^/]+\/)?content\/toc\.json$/
const I18N_PATH = /^(?:[^/]+\/)?content\/i18n\/[^/]+\/(?:glossary|texts)\.json$/
const PAGE_HTML_PATH = /^(?:[^/]+\/)?[^/]+\.html$/
const RUNTIME_CONFIG_PATH = /^(?:[^/]+\/)?assets\/config\.json$/
const PAGES_PATH = /^(?:[^/]+\/)?content\/pages\.json$/
const COVER_PATH = /^(?:[^/]+\/)?cover\.(?:png|jpe?g|webp)$/i
const PREVIEW_IMAGE_PATH = /^(?:[^/]+\/)?images\/[^/]+\.(?:gif|jpe?g|png|webp)$/i
const AGENT_GUIDE_PATH = /^(?:[^/]+\/)?(?:AGENTS|CLAUDE)\.md$/i

const RuntimeConfig = z.object({
  title: z.string().trim().min(1).optional(),
  bundleVersion: z.union([z.string().trim().min(1), z.number()]).optional(),
  languages: z.object({
    available: z.array(z.string().trim().min(2)).min(1),
    default: z.string().trim().min(2),
  }).optional(),
  features: z.record(z.boolean()).optional(),
}).passthrough()

const RuntimePages = z.array(z.object({
  section_id: z.string().regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    "section_id must be a filesystem-safe identifier",
  ),
  href: z.string().min(1),
  page_number: z.number().int().positive().optional(),
}).passthrough()).superRefine((pages, ctx) => {
  const sectionIds = new Set<string>()
  const hrefs = new Set<string>()
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]
    if (sectionIds.has(page.section_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "section_id"],
        message: `Duplicate page section id: ${page.section_id}`,
      })
    }
    if (hrefs.has(page.href)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "href"],
        message: `Duplicate page href: ${page.href}`,
      })
    }
    sectionIds.add(page.section_id)
    hrefs.add(page.href)
  }
})

function isSafeArchivePath(name: string): boolean {
  if (name.length === 0 || name.includes("\0") || name.includes("\\") || name.startsWith("/")) {
    return false
  }
  const directory = name.endsWith("/")
  const parts = name.split("/")
  if (directory) parts.pop()
  return parts.length > 0 && parts.every((part) => part.length > 0 && part !== "." && part !== "..")
}

function selectedLimit(name: string, includePreviewImages: boolean): number | null {
  if (MANIFEST_PATH.test(name)) return ADT_BUNDLE_READER_LIMITS.manifestBytes
  if (TOC_PATH.test(name) || I18N_PATH.test(name)) return ADT_BUNDLE_READER_LIMITS.jsonBytes
  if (RUNTIME_CONFIG_PATH.test(name) || PAGES_PATH.test(name)) return ADT_BUNDLE_READER_LIMITS.jsonBytes
  if (COVER_PATH.test(name)) return 10 * 1024 * 1024
  if (AGENT_GUIDE_PATH.test(name)) return 512 * 1024
  if (includePreviewImages && PREVIEW_IMAGE_PATH.test(name)) return 10 * 1024 * 1024
  if (PAGE_HTML_PATH.test(name)) return ADT_BUNDLE_READER_LIMITS.htmlBytes
  return null
}

function decodeUtf8(path: string, bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new AdtBundleReadError(`Archive file is not valid UTF-8: ${path}`)
  }
}

function parseJson<T>(path: string, bytes: Uint8Array, schema: ZodType<T>): T {
  let value: unknown
  try {
    value = JSON.parse(decodeUtf8(path, bytes))
  } catch (error) {
    if (error instanceof AdtBundleReadError) throw error
    throw new AdtBundleReadError(`Archive file is not valid JSON: ${path}`)
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const at = issue.path.length > 0 ? ` at ${issue.path.join(".")}` : ""
    throw new AdtBundleReadError(`Archive file has an invalid shape: ${path}${at}: ${issue.message}`)
  }
  return parsed.data
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function fingerprintJson(value: unknown): string {
  return sha256(canonicalJson(value))
}

function legacyBookLabel(root: string, title: string): string {
  const wrapper = root.replace(/\/$/, "").split("/").pop() ?? ""
  const candidate = wrapper || title
  return candidate
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/-+$/g, "")
    .slice(0, 255) || "recovered-adt"
}

function legacyRoot(files: Record<string, Uint8Array>): string | null {
  const paths = Object.keys(files)
  const pagePaths = paths.filter((filePath) => PAGES_PATH.test(filePath))
  const configPaths = paths.filter((filePath) => RUNTIME_CONFIG_PATH.test(filePath))
  if (pagePaths.length === 0 && configPaths.length === 0) return null
  if (pagePaths.length !== 1) {
    throw new AdtBundleReadError(
      pagePaths.length === 0
        ? "Legacy ADT export is missing content/pages.json"
        : "Legacy ADT export contains multiple content/pages.json files",
    )
  }
  const root = pagePaths[0].slice(0, -"content/pages.json".length)
  if (!files[`${root}assets/config.json`]) {
    throw new AdtBundleReadError("Legacy ADT export is missing assets/config.json")
  }
  if (configPaths.some((filePath) => !filePath.startsWith(root))) {
    throw new AdtBundleReadError("Legacy ADT export contains ambiguous runtime configuration")
  }
  return root
}

function createLegacyManifest(
  files: Record<string, Uint8Array>,
  root: string,
  runtimeConfig: z.infer<typeof RuntimeConfig>,
): AdtRoundTripManifestData {
  if (runtimeConfig.bundleVersion === undefined || !runtimeConfig.languages) {
    throw new AdtBundleReadError(
      "This publication is not a recognized legacy ADT Studio export: assets/config.json is missing its bundle version or languages",
    )
  }
  const source = runtimeConfig.languages.default
  const output = [...new Set(runtimeConfig.languages.available)]
  if (!output.includes(source)) {
    throw new AdtBundleReadError(
      "Legacy ADT export has an invalid language configuration: the default language is not available",
    )
  }
  const sourceTextsPath = `${root}content/i18n/${source}/texts.json`
  const sourceTexts = parseJson(
    sourceTextsPath,
    requiredFile(files, sourceTextsPath),
    AdtBundleTexts,
  )
  const title = runtimeConfig.title ?? titleFromHtml(files[`${root}index.html`])
  if (!title) {
    throw new AdtBundleReadError("Legacy ADT export is missing its publication title")
  }
  const ids = Object.keys(sourceTexts).sort((left, right) => left.localeCompare(right))
  return AdtRoundTripManifest.parse({
    formatVersion: 1,
    book: { label: legacyBookLabel(root, title), title },
    languages: { source, output },
    baselines: {
      glossary: null,
      tocGeneration: null,
      textCatalogTranslations: {},
    },
    textCatalog: { version: 1, idFingerprint: fingerprintJson(ids) },
    translatableText: { idFingerprint: fingerprintJson(ids) },
  })
}

function extractSelected(
  zipBuffer: Buffer,
  includePreviewImages: boolean,
): Record<string, Uint8Array> {
  if (zipBuffer.byteLength > ADT_BUNDLE_READER_LIMITS.archiveBytes) {
    throw new AdtBundleReadError("ADT bundle exceeds the compressed archive size limit")
  }

  const seen = new Set<string>()
  let entryCount = 0
  let selectedBytes = 0
  try {
    return unzipSync(zipBuffer, {
      filter(info) {
        entryCount++
        if (entryCount > ADT_BUNDLE_READER_LIMITS.entries) {
          throw new AdtBundleReadError("ADT bundle contains too many archive entries")
        }
        if (!isSafeArchivePath(info.name)) {
          throw new AdtBundleReadError(`ADT bundle contains an unsafe path: ${info.name}`)
        }
        if (seen.has(info.name)) {
          throw new AdtBundleReadError(`ADT bundle contains a duplicate path: ${info.name}`)
        }
        seen.add(info.name)

        const limit = selectedLimit(info.name, includePreviewImages)
        if (limit === null) return false
        if (!Number.isSafeInteger(info.originalSize) || info.originalSize < 0 || info.originalSize > limit) {
          throw new AdtBundleReadError(`ADT bundle file exceeds its size limit: ${info.name}`)
        }
        selectedBytes += info.originalSize
        if (selectedBytes > ADT_BUNDLE_READER_LIMITS.selectedBytes) {
          throw new AdtBundleReadError("ADT bundle selected content exceeds the size limit")
        }
        return true
      },
    })
  } catch (error) {
    if (error instanceof AdtBundleReadError) throw error
    throw new AdtBundleReadError("Invalid or unsupported ADT ZIP bundle")
  }
}

function requiredFile(files: Record<string, Uint8Array>, path: string): Uint8Array {
  const value = files[path]
  if (!value) throw new AdtBundleReadError(`ADT bundle is missing required file: ${path}`)
  return value
}

function titleFromHtml(bytes: Uint8Array | undefined): string | null {
  if (!bytes) return null
  const match = decodeUtf8("index.html", bytes).match(/<title[^>]*>([^<]+)<\/title>/i)
  if (!match) return null
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim() || null
}

function coverMimeType(filePath: string): string {
  const extension = filePath.toLowerCase().split(".").pop()
  if (extension === "png") return "image/png"
  if (extension === "webp") return "image/webp"
  return "image/jpeg"
}

function rasterImageMimeType(filePath: string): string {
  const extension = filePath.toLowerCase().split(".").pop()
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
  if (extension === "webp") return "image/webp"
  if (extension === "gif") return "image/gif"
  return "image/png"
}

export function readAdtBundle(
  zipBuffer: Buffer,
  options: { includePreviewImages?: boolean } = {},
): ReadAdtBundle {
  const files = extractSelected(zipBuffer, options.includePreviewImages === true)
  const manifestPaths = Object.keys(files).filter((path) => MANIFEST_PATH.test(path))
  if (manifestPaths.length > 1) {
    throw new AdtBundleReadError("ADT bundle contains multiple manifest.json files")
  }

  const detectedLegacyRoot = manifestPaths.length === 0 ? legacyRoot(files) : null
  if (manifestPaths.length === 0 && detectedLegacyRoot === null) {
    throw new AdtBundleNotDetectedError()
  }
  const manifestPath = manifestPaths[0]
  const root = manifestPath
    ? manifestPath.slice(0, -"manifest.json".length)
    : detectedLegacyRoot!
  const runtimeConfigPath = `${root}assets/config.json`
  const runtimeConfig = files[runtimeConfigPath]
    ? parseJson(runtimeConfigPath, files[runtimeConfigPath], RuntimeConfig)
    : null
  const manifest = manifestPath
    ? parseJson(manifestPath, files[manifestPath], AdtRoundTripManifest)
    : createLegacyManifest(
        files,
        root,
        runtimeConfig ?? (() => {
          throw new AdtBundleReadError("Legacy ADT export is missing assets/config.json")
        })(),
      )
  const sourceFormat = manifest.editingContract
    ? "round-trip" as const
    : "legacy-studio-export" as const
  const pagesPath = `${root}content/pages.json`
  const pages = files[pagesPath]
    ? parseJson(pagesPath, files[pagesPath], RuntimePages)
    : []
  const pageHtml = Object.create(null) as Record<string, string>
  for (const page of pages) {
    const bytes = files[`${root}${page.href}`]
    if (!bytes) {
      throw new AdtBundleReadError(`ADT bundle is missing page HTML: ${page.href}`)
    }
    pageHtml[page.href] = decodeUtf8(`${root}${page.href}`, bytes)
  }
  const coverPath = Object.keys(files)
    .filter((filePath) => filePath.startsWith(root) && COVER_PATH.test(filePath))
    .sort()[0]
  const previewImages = Object.create(null) as Record<
    string,
    { bytes: Uint8Array; mimeType: string }
  >
  if (options.includePreviewImages) {
    for (const [filePath, bytes] of Object.entries(files)) {
      if (!filePath.startsWith(root)) continue
      const relativePath = filePath.slice(root.length)
      if (!/^images\/[^/]+\.(?:gif|jpe?g|png|webp)$/i.test(relativePath)) continue
      previewImages[relativePath] = {
        bytes,
        mimeType: rasterImageMimeType(relativePath),
      }
    }
  }
  const title = manifest.book.title
    ?? runtimeConfig?.title
    ?? titleFromHtml(files[`${root}index.html`])
    ?? manifest.book.label
  const readAgentGuide = (name: "agents.md" | "claude.md"): string | null => {
    const matches = Object.keys(files).filter((filePath) => (
      filePath.startsWith(root)
      && filePath.slice(root.length).toLowerCase() === name
    ))
    if (matches.length > 1) {
      throw new AdtBundleReadError(`ADT bundle contains duplicate assistant guides: ${name}`)
    }
    return matches[0] ? decodeUtf8(matches[0], files[matches[0]]) : null
  }
  const tocPath = `${root}content/toc.json`
  const toc = parseJson(tocPath, requiredFile(files, tocPath), AdtBundleToc)

  const glossaries = Object.create(null) as Record<string, AdtBundleGlossaryData>
  const texts = Object.create(null) as Record<string, AdtBundleTextsData>
  for (const language of new Set([manifest.languages.source, ...manifest.languages.output])) {
    const textsPath = `${root}content/i18n/${language}/texts.json`
    texts[language] = parseJson(textsPath, requiredFile(files, textsPath), AdtBundleTexts)

    const glossaryPath = `${root}content/i18n/${language}/glossary.json`
    if (files[glossaryPath]) {
      glossaries[language] = parseJson(glossaryPath, files[glossaryPath], AdtBundleGlossary)
    }
  }

  let sourceTextsChanged = false
  const sourceTextsFingerprint = manifest.frozen?.sourceTextsFingerprint
  if (sourceTextsFingerprint) {
    const sourceTexts = texts[manifest.languages.source]
    sourceTextsChanged = !sourceTexts || fingerprintJson(sourceTexts) !== sourceTextsFingerprint
  }

  const pageHtmlChanged: string[] = []
  const pageHtmlMissing: string[] = []
  for (const [href, expected] of Object.entries(manifest.frozen?.pageHtmlFingerprints ?? {})) {
    const bytes = files[`${root}${href}`]
    if (!bytes) pageHtmlMissing.push(href)
    else if (sha256(bytes) !== expected) pageHtmlChanged.push(href)
  }

  return {
    root,
    sourceFormat,
    manifest,
    title,
    cover: coverPath
      ? { bytes: files[coverPath], mimeType: coverMimeType(coverPath) }
      : null,
    pageCount: pages.length,
    pages,
    pageHtml,
    runtimeFeatures: runtimeConfig?.features ?? {},
    toc,
    glossaries,
    texts,
    ignoredEdits: {
      sourceTextsChanged,
      pageHtmlChanged: pageHtmlChanged.sort(),
      pageHtmlMissing: pageHtmlMissing.sort(),
    },
    agentGuides: {
      agentsMd: readAgentGuide("agents.md"),
      claudeMd: readAgentGuide("claude.md"),
    },
    ...(options.includePreviewImages ? { previewImages } : {}),
  }
}
