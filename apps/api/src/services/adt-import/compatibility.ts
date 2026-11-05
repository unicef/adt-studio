import path from "node:path"

import {
  ADT_EDITING_ALLOWED_ROOT_ENTRIES,
  inspectImportedHtmlContract,
  isImportedFixedLayoutPage,
  projectImportedHtmlSection,
} from "@adt/pipeline"
import {
  ADT_EDITING_CONTRACT_VERSION,
  ADT_EDITING_CONTRACT_MIN_VERSION,
  type AdtImportCompatibility,
  type AdtImportCompatibilityIssue,
} from "@adt/types"

import type { ReadAdtBundle } from "./bundle-reader.js"
import { pageIdFromSection } from "./catalog.js"

/**
 * Sections whose source page already ended earlier in the reading order.
 * Import groups a page's sections together, so `pg001_sec001, pg002_sec001,
 * pg001_sec002` would silently become `pg001_sec001, pg001_sec002,
 * pg002_sec001`; such an order is rejected rather than rearranged.
 */
function interleavedReadingOrder(
  pages: ReadonlyArray<{ section_id: string; href: string }>,
): Array<{ href: string; pageId: string; after: string }> {
  const closed = new Set<string>()
  const interleaved: Array<{ href: string; pageId: string; after: string }> = []
  let current: string | null = null
  let previousSectionId = ""
  pages.forEach((page, index) => {
    const pageId = pageIdFromSection(page.section_id, index)
    const key = pageId ?? `quiz:${page.section_id}`
    if (key !== current) {
      if (current !== null) closed.add(current)
      if (pageId && closed.has(pageId)) {
        interleaved.push({ href: page.href, pageId, after: previousSectionId })
      }
      current = key
    }
    previousSectionId = page.section_id
  })
  return interleaved
}

export function assessAdtImportCompatibility(
  bundle: ReadAdtBundle,
  archiveFiles: Record<string, Uint8Array>,
): AdtImportCompatibility {
  const archivePaths = new Set(Object.keys(archiveFiles))
  const issues: AdtImportCompatibilityIssue[] = []
  const pageHrefs = new Set(bundle.pages.map((page) => page.href))
  for (const archivePath of archivePaths) {
    if (!archivePath.startsWith(bundle.root)) continue
    const relativePath = archivePath.slice(bundle.root.length)
    if (!relativePath || relativePath.endsWith("/")) continue
    const [rootEntry] = relativePath.split("/")
    const allowedRootHtml = !relativePath.includes("/")
      && relativePath.endsWith(".html")
      && pageHrefs.has(relativePath)
    if (!allowedRootHtml && !ADT_EDITING_ALLOWED_ROOT_ENTRIES.has(rootEntry)) {
      issues.push({
        code: "unexpected-bundle-entry",
        pageHref: relativePath,
        detail: rootEntry,
      })
    }
  }
  if (!bundle.manifest.editingContract && bundle.sourceFormat !== "legacy-studio-export") {
    issues.push({
      code: "missing-editing-contract",
      pageHref: "manifest.json",
    })
  } else if (
    bundle.manifest.editingContract
    && (
      bundle.manifest.editingContract.version < ADT_EDITING_CONTRACT_MIN_VERSION
      || bundle.manifest.editingContract.version > ADT_EDITING_CONTRACT_VERSION
    )
  ) {
    issues.push({
      code: "unsupported-editing-contract",
      pageHref: "manifest.json",
      detail: String(bundle.manifest.editingContract.version),
    })
  }
  const stylesheets = new Set<string>()
  const declaredOrder = bundle.manifest.editingContract?.pageOrder
  if (declaredOrder && (
    declaredOrder.length !== bundle.pages.length
    || declaredOrder.some((page, index) => (
      page.sectionId !== bundle.pages[index]?.section_id
      || page.href !== bundle.pages[index]?.href
    ))
  )) {
    issues.push({ code: "changed-page-structure", pageHref: "content/pages.json" })
  }
  for (const entry of interleavedReadingOrder(bundle.pages)) {
    issues.push({
      code: "interleaved-reading-order",
      pageHref: entry.href,
      detail: `${entry.pageId} resumes after ${entry.after}`,
    })
  }
  const declaredDataIds = bundle.manifest.editingContract?.pageDataIds
  if (bundle.manifest.editingContract?.version === ADT_EDITING_CONTRACT_VERSION && declaredOrder) {
    const declaredHrefs = new Set(declaredOrder.map((page) => page.href))
    for (const page of declaredOrder) {
      if (!Object.prototype.hasOwnProperty.call(declaredDataIds ?? {}, page.href)) {
        issues.push({ code: "changed-page-structure", pageHref: page.href })
      }
    }
    for (const href of Object.keys(declaredDataIds ?? {})) {
      if (!declaredHrefs.has(href)) {
        issues.push({ code: "changed-page-structure", pageHref: href })
      }
    }
  }
  for (const page of bundle.pages) {
    const generatedQuizPage = /^(?:qz|quiz)[-_]?\d*/i.test(page.section_id)
    if (path.posix.dirname(page.href) !== ".") {
      issues.push({ code: "nested-page", pageHref: page.href })
    }
    const originalInspection = inspectImportedHtmlContract(
      bundle.pageHtml[page.href] ?? "",
      page.section_id,
      {
        allowSectionDataId: generatedQuizPage,
        // Round-trip exports of a fixed-layout book carry positioned pages with
        // no semantic <section>. Requiring one rejected every fixed-layout book
        // we had just exported ourselves.
        fixedLayoutPage: isImportedFixedLayoutPage(bundle.pageHtml[page.href] ?? ""),
      },
    )
    const inspection = bundle.sourceFormat === "legacy-studio-export"
      ? inspectImportedHtmlContract(
          `<div id="content">${projectImportedHtmlSection(
            bundle.pageHtml[page.href] ?? "",
            page.section_id,
            undefined,
            { repairLegacyIds: true },
          ).html}</div>`,
          page.section_id,
        )
      : originalInspection
    issues.push(...inspection.issues.map((issue) => ({
      code: issue.code,
      pageHref: page.href,
      ...(issue.detail ? { detail: issue.detail } : {}),
    })))
    if (bundle.sourceFormat === "legacy-studio-export") {
      const resourceIssueCodes = new Set([
        "remote-asset",
        "unsafe-asset",
        "unsupported-stylesheet",
        "unsupported-script",
        "unsupported-asset-location",
      ])
      issues.push(...originalInspection.issues
        .filter((issue) => resourceIssueCodes.has(issue.code))
        .map((issue) => ({
          code: issue.code,
          pageHref: page.href,
          ...(issue.detail ? { detail: issue.detail } : {}),
        })))
    }
    const declaredIds = declaredDataIds?.[page.href]
    const legacyQuizContract = generatedQuizPage && declaredIds?.length === 0
    if (declaredIds && !legacyQuizContract && (
      declaredIds.length !== inspection.dataIds.length
      || declaredIds.some((id, index) => id !== inspection.dataIds[index])
    )) {
      issues.push({ code: "changed-page-structure", pageHref: page.href })
    }
    for (const asset of originalInspection.localAssets) {
      let decoded = asset
      try { decoded = decodeURIComponent(asset) } catch { /* use the literal path */ }
      const relativePath = path.posix.normalize(
        path.posix.join(path.posix.dirname(page.href), decoded),
      )
      if (!archivePaths.has(`${bundle.root}${relativePath}`)) {
        issues.push({ code: "missing-asset", pageHref: page.href, detail: asset })
      } else if (relativePath.toLowerCase().endsWith(".css")) {
        stylesheets.add(relativePath)
      }
    }
  }
  const checkedStylesheets = new Set<string>()
  while (stylesheets.size > 0) {
    const stylesheet = stylesheets.values().next().value as string
    stylesheets.delete(stylesheet)
    if (checkedStylesheets.has(stylesheet)) continue
    checkedStylesheets.add(stylesheet)
    const bytes = archiveFiles[`${bundle.root}${stylesheet}`]
    if (!bytes) continue
    const css = new TextDecoder().decode(bytes)
    const references = [
      ...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi),
      ...css.matchAll(/@import\s+["']([^"']+)["']/gi),
    ].map((match) => match[1].trim())
    for (const reference of references) {
      if (!reference || reference.startsWith("#") || reference.startsWith("data:")) continue
      if (/^(?:https?:)?\/\//i.test(reference)) {
        issues.push({ code: "remote-asset", pageHref: stylesheet, detail: reference })
        continue
      }
      if (/^(?:[a-z]+:|\/|\\)/i.test(reference)) {
        issues.push({ code: "unsafe-asset", pageHref: stylesheet, detail: reference })
        continue
      }
      const resolved = path.posix.normalize(path.posix.join(
        path.posix.dirname(stylesheet),
        reference.split(/[?#]/, 1)[0],
      ))
      if (resolved === ".." || resolved.startsWith("../")) {
        issues.push({ code: "unsafe-asset", pageHref: stylesheet, detail: reference })
      } else if (!archivePaths.has(`${bundle.root}${resolved}`)) {
        issues.push({
          code: "missing-asset",
          pageHref: stylesheet,
          detail: reference,
        })
      } else if (resolved.toLowerCase().endsWith(".css")) {
        stylesheets.add(resolved)
      }
    }
  }
  const unique = [...new Map(issues.map((issue) => [
    `${issue.code}:${issue.pageHref}:${issue.detail ?? ""}`,
    issue,
  ])).values()].slice(0, 50)
  return { supported: unique.length === 0, issues: unique }
}
