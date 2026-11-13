import fs from "node:fs"
import path from "node:path"

import { createBookStorage } from "@adt/storage"
import { AdtActivityImportDecision, parseBookLabel, type AdtImportedActivityReview } from "@adt/types"

import { extractAdtBundleArchiveFiles, readAdtBundle } from "./bundle-reader.js"
import { analyzeImportedActivities } from "./activity-reconciliation.js"
import { AdtImportError } from "./error.js"
import { applyFixedLayoutBookConfig } from "./fixed-layout.js"
import {
  seedImportedCoreTts,
  seedImportedEasyRead,
  seedImportedFeatures,
  seedImportedImages,
  seedImportedSignLanguage,
  seedImportedSpeech,
  seedImportedStoryboard,
  seedPages,
  warnOnUndetectedFixedLayout,
} from "./seed/index.js"
import {
  ImportedAdtSourceError,
  bookDirFor,
  isImportedAdtProject,
  readImportedAdtCurrent,
  readImportedAdtSourceArchive,
  writeImportedAdtCurrent,
} from "./source.js"

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

export const ADT_IMPORT_PROJECTION_VERSION = 6


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
/**
 * Entities a projection writes over unconditionally. The other seeds only fill
 * in what is missing, so they cannot replace later work. The activity review is
 * rewritten too, but its decisions are read back and replayed first.
 */
const REPLAYED_NODES = new Set([
  "page-sectioning",
  "fixed-layout-sectioning",
  "web-rendering",
  "image-captioning",
  "toc-generation",
  "glossary",
])

/** Current version of every replayed entity, keyed `node/itemId`. */
export function readReplayedNodeVersions(label: string, booksDir: string): Record<string, number> {
  const storage = createBookStorage(label, booksDir)
  try {
    return Object.fromEntries(storage.getNodeVersionFingerprint()
      .filter((row) => REPLAYED_NODES.has(row.node))
      .map((row) => [`${row.node}/${row.itemId}`, row.version]))
  } finally {
    storage.close()
  }
}

/**
 * Whether replaying the archive would replace nothing but projection output.
 * `projectedVersions` is recorded whenever a projection is written; a marker
 * from before that has none, and a fresh import writes every entity once, so
 * version 1 is the baseline then. Any other version means the user (or a
 * pipeline run) has changed the entity since it was projected.
 */
function replayKeepsLaterWork(
  current: Record<string, unknown>,
  versions: Record<string, number>,
): boolean {
  const recorded = current.projectedVersions
  const baseline = recorded && typeof recorded === "object" && !Array.isArray(recorded)
    ? recorded as Record<string, unknown>
    : null
  return Object.entries(versions).every(([key, version]) => (
    version === (baseline ? baseline[key] : 1)
  ))
}

/** Upgrade projects imported before the normal pipeline projection existed.
 * Every entity write appends a version; the immutable source ZIP remains the
 * rollback/audit source if an upgrade is interrupted. A project changed since
 * its last projection is never replayed: rebuilding it from the archive would
 * make the archive's content current again over the user's later edits. */
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

  if (!replayKeepsLaterWork(current, readReplayedNodeVersions(safeLabel, booksDir))) {
    console.warn(
      `[adt-import] ${safeLabel} changed after it was imported; keeping its current content instead of re-projecting the archive.`,
    )
    // Marked as upgraded so the check does not repeat on every start. No
    // `projectedVersions` is recorded, so a later projection bump skips it too.
    const { projectedVersions: _stale, ...rest } = current
    writeImportedAdtCurrent(bookDir, {
      ...rest,
      projectionVersion: ADT_IMPORT_PROJECTION_VERSION,
      projectionReplaySkippedFrom: current.projectionVersion ?? null,
    })
    return false
  }

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
  const generatedAt = new Date().toISOString()
  seedImportedFeatures(safeLabel, booksDir, bundle, generatedAt)
  seedImportedEasyRead(safeLabel, booksDir, bundle, generatedAt)
  seedImportedCoreTts(safeLabel, booksDir, bundle, files, generatedAt)
  seedImportedImages(safeLabel, booksDir, bundle, files)
  seedImportedSignLanguage(safeLabel, booksDir, bundle, files)
  seedImportedSpeech(safeLabel, booksDir, bundle, files, generatedAt)
  warnOnUndetectedFixedLayout(bundle, storyboard.fixedLayoutPageCount)
  if (storyboard.fixedLayoutPageCount > 0) {
    applyFixedLayoutBookConfig(bookDir)
  }

  writeImportedAdtCurrent(bookDir, {
    ...current,
    projectionVersion: ADT_IMPORT_PROJECTION_VERSION,
    projectedVersions: readReplayedNodeVersions(safeLabel, booksDir),
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
