import fs from "node:fs"
import path from "node:path"

import { createBookStorage } from "@adt/storage"
import { AdtActivityImportDecision, parseBookLabel, type AdtImportedActivityReview } from "@adt/types"

import { extractAdtBundleArchiveFiles, readAdtBundle } from "./adt-bundle-reader.js"
import { analyzeImportedActivities } from "./adt-activity-reconciliation.js"
import { AdtImportError } from "./adt-import-error.js"
import { applyFixedLayoutBookConfig } from "./adt-import-fixed-layout.js"
import {
  seedImportedFeatures,
  seedImportedImages,
  seedImportedStoryboard,
  seedPages,
  warnOnUndetectedFixedLayout,
} from "./adt-import-seed/index.js"
import {
  ImportedAdtSourceError,
  bookDirFor,
  isImportedAdtProject,
  readImportedAdtCurrent,
  readImportedAdtSourceArchive,
  writeImportedAdtCurrent,
} from "./imported-adt-source.js"

/** Map the source-archive error onto the import subsystem's error so callers
 * only have to know one type. */
function readCurrentImportedAdtSource(label: string, booksDir: string): Buffer {
  try {
    return readImportedAdtSourceArchive(bookDirFor(label, booksDir))
  } catch (error) {
    if (error instanceof ImportedAdtSourceError) throw new AdtImportError(error.message)
    throw error
  }
}

export const ADT_IMPORT_PROJECTION_VERSION = 4


/**
 * Activity classifications the user made when this project was imported. Any
 * decision the current review no longer asks for is dropped rather than
 * replayed, because `resolveImportedActivityDecisions` rejects answers to
 * questions it did not ask.
 */
function readPersistedActivityDecisions(
  label: string,
  booksDir: string,
  review: AdtImportedActivityReview,
): AdtActivityImportDecision[] {
  const asked = new Set(
    review.items.filter((item) => item.status === "needs-review").map((item) => item.sectionId),
  )
  if (asked.size === 0) return []
  const storage = createBookStorage(label, booksDir)
  let stored: unknown
  try {
    stored = storage.getLatestNodeData("imported-activity-review", "book")?.data
  } finally {
    storage.close()
  }
  const decisions = (stored as { decisions?: unknown })?.decisions
  if (!Array.isArray(decisions)) return []
  const seen = new Set<string>()
  const recovered: AdtActivityImportDecision[] = []
  for (const candidate of decisions) {
    const parsed = AdtActivityImportDecision.safeParse(candidate)
    if (!parsed.success) continue
    if (!asked.has(parsed.data.sectionId) || seen.has(parsed.data.sectionId)) continue
    seen.add(parsed.data.sectionId)
    recovered.push(parsed.data)
  }
  return recovered
}


/** Upgrade projects imported before the normal pipeline projection existed.
 * Every entity write appends a version; the immutable source ZIP remains the
 * rollback/audit source if an upgrade is interrupted. */
export function ensureImportedAdtProjectProjection(label: string, booksDir: string): boolean {
  const safeLabel = parseBookLabel(label)
  const bookDir = bookDirFor(label, booksDir)
  if (!isImportedAdtProject(bookDir)) return false

  let current: Record<string, unknown>
  try {
    current = readImportedAdtCurrent(bookDir)
  } catch (error) {
    if (error instanceof ImportedAdtSourceError) {
      throw new AdtImportError(error.message)
    }
    throw error
  }
  if (
    typeof current.projectionVersion === "number"
    && current.projectionVersion >= ADT_IMPORT_PROJECTION_VERSION
  ) return false

  const sourceZip = readCurrentImportedAdtSource(safeLabel, booksDir)
  const bundle = readAdtBundle(sourceZip)
  const files = extractAdtBundleArchiveFiles(sourceZip)
  const legacyRecovery = bundle.sourceFormat === "legacy-studio-export"
  // Re-projecting from the archive would otherwise discard how the user
  // classified this book's ambiguous activities at import time. A project
  // imported before those decisions were recorded has none to replay; it keeps
  // the unclassified projection rather than blocking the upgrade.
  const activityReview = analyzeImportedActivities(bundle)
  const activityDecisions = readPersistedActivityDecisions(safeLabel, booksDir, activityReview)
  // `resolveImportedActivityDecisions` is all-or-nothing by design — it guards
  // the import path, where every open question must be answered before the user
  // may proceed. An upgrade has no user to ask, and failing it wholesale would
  // discard the answers we do still have, so map those directly and leave any
  // newly-ambiguous section unclassified.
  const activityOverrides: ReadonlyMap<string, string> = new Map(
    activityDecisions.map((decision) => [decision.sectionId, decision.type ?? "content"]),
  )
  seedPages(path.join(bookDir, `${safeLabel}.db`), bundle.pages, bundle.pageHtml, legacyRecovery)
  const storyboard = seedImportedStoryboard(
    safeLabel,
    booksDir,
    bundle.pages,
    bundle.pageHtml,
    bundle.toc,
    legacyRecovery,
    bundle.texts[bundle.manifest.languages.source] ?? {},
    activityOverrides,
    activityReview,
    activityDecisions,
  )
  seedImportedFeatures(safeLabel, booksDir, bundle, new Date().toISOString())
  seedImportedImages(safeLabel, booksDir, bundle, files)
  warnOnUndetectedFixedLayout(bundle, storyboard.fixedLayoutPageCount)
  if (storyboard.fixedLayoutPageCount > 0) {
    applyFixedLayoutBookConfig(bookDir)
  }

  writeImportedAdtCurrent(bookDir, {
    ...current,
    projectionVersion: ADT_IMPORT_PROJECTION_VERSION,
  })
  return true
}

export function upgradeImportedAdtProjects(booksDir: string): void {
  const root = path.resolve(booksDir)
  if (!fs.existsSync(root)) return
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!isImportedAdtProject(path.join(root, entry.name))) continue
    try {
      ensureImportedAdtProjectProjection(entry.name, root)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[adt-import] Could not upgrade ${entry.name}: ${message}`)
    }
  }
}

