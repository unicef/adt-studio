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
  type AdtImportCompatibilityIssueCode,
} from "@adt/types"

import type { ReadAdtBundle } from "./bundle-reader.js"
import { findCrossPageDuplicateIds, pageIdFromSection } from "./catalog.js"

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

/** Examples of each problem type the report carries. One widespread problem
 * (a script on every page) must not hide the others behind a global cap. */
export const MAX_REPORTED_ISSUES_PER_CODE = 10

export function assessAdtImportCompatibility(
  bundle: ReadAdtBundle,
  archiveFiles: Record<string, Uint8Array>,
): AdtImportCompatibility {
  return summarizeAdtImportIssues(collectAdtImportIssues(bundle, archiveFiles))
}

/** Every problem in the archive, once each, uncapped. */
export function collectAdtImportIssues(
  bundle: ReadAdtBundle,
  archiveFiles: Record<string, Uint8Array>,
): AdtImportCompatibilityIssue[] {
  const archivePaths = new Set(Object.keys(archiveFiles))
  const issues: AdtImportCompatibilityIssue[] = []
  const pageHrefs = new Set(bundle.pages.map((page) => page.href))
  // One issue per stray top-level entry (a stray folder can hold thousands
  // of files), so they can't crowd real problems out of the report.
  const reportedStrayEntries = new Set<string>()
  for (const archivePath of archivePaths) {
    if (!archivePath.startsWith(bundle.root)) continue
    const relativePath = archivePath.slice(bundle.root.length)
    if (!relativePath || relativePath.endsWith("/")) continue
    const [rootEntry] = relativePath.split("/")
    const allowedRootHtml = !relativePath.includes("/")
      && relativePath.endsWith(".html")
      && pageHrefs.has(relativePath)
    if (!allowedRootHtml && !ADT_EDITING_ALLOWED_ROOT_ENTRIES.has(rootEntry) && !reportedStrayEntries.has(rootEntry)) {
      reportedStrayEntries.add(rootEntry)
      // A page at the root that the reading order leaves out (credits, teacher
      // notes) is a page, not a stray folder, and deleting it may break the
      // delivered book (#1154).
      const unlistedRootPage = !relativePath.includes("/") && /\.html?$/i.test(relativePath)
      issues.push({
        code: unlistedRootPage ? "unlisted-root-page" : "unexpected-bundle-entry",
        // Name the folder, not its first file, so the whole folder is removed.
        pageHref: relativePath.includes("/") ? `${rootEntry}/` : relativePath,
        detail: rootEntry,
      })
    }
  }
  // A manifest without an editing contract is read as an older export
  // (sourceFormat "legacy-studio-export", see readAdtBundle) and recovered on
  // the tolerant legacy path, so there is no "missing contract" case here.
  if (
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
  // The catalog keeps one entry per id, so an id on two pages is reported
  // here, every one of them, rather than failing the read on the first (#1153).
  for (const duplicate of findCrossPageDuplicateIds(
    bundle.pages,
    bundle.pageHtml,
    bundle.sourceFormat === "legacy-studio-export",
  )) {
    const [first, ...others] = duplicate.hrefs
    issues.push({
      code: "cross-page-duplicate-data-id",
      pageHref: first,
      detail: others.length > 0
        ? `${duplicate.id} (also on ${others.join(", ")})`
        : duplicate.id,
    })
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
  return [...new Map(issues.map((issue) => [
    `${issue.code}:${issue.pageHref}:${issue.detail ?? ""}`,
    issue,
  ])).values()]
}

/**
 * The report the review and the repair request show: up to
 * MAX_REPORTED_ISSUES_PER_CODE examples of each problem type, grouped by type
 * in the order the types were found, stray files last, and the total of each
 * type so the counts shown are the real ones.
 */
export function summarizeAdtImportIssues(
  issues: readonly AdtImportCompatibilityIssue[],
): AdtImportCompatibility {
  const byCode = new Map<AdtImportCompatibilityIssueCode, AdtImportCompatibilityIssue[]>()
  for (const issue of issues) {
    const group = byCode.get(issue.code) ?? []
    group.push(issue)
    byCode.set(issue.code, group)
  }
  const codes = [
    ...[...byCode.keys()].filter((code) => code !== "unexpected-bundle-entry"),
    ...[...byCode.keys()].filter((code) => code === "unexpected-bundle-entry"),
  ]
  const reported = codes.flatMap((code) => byCode.get(code)!.slice(0, MAX_REPORTED_ISSUES_PER_CODE))
  return {
    supported: issues.length === 0,
    issues: reported,
    ...(issues.length > 0
      ? { issueCounts: Object.fromEntries(codes.map((code) => [code, byCode.get(code)!.length])) }
      : {}),
    ...(issues.length > reported.length ? { omittedIssueCount: issues.length - reported.length } : {}),
  }
}
