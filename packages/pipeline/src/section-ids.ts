import type { Storage } from "@adt/storage"
import {
  formatSectionId,
  parseAnySectionId,
  MAX_SECTION_SEQ,
  TocGenerationOutput,
  TTSOutput,
  WordTimestampOutput,
  parseVoiceSlotEntryId,
  sectionIdOfAnswerTextId,
} from "@adt/types"
import { PAGE_SECTIONING_NODE, FIXED_LAYOUT_SECTIONING_NODE } from "./render-sectioning.js"

/**
 * Thrown when a page has burned all `MAX_SECTION_SEQ` of its sequence numbers.
 *
 * A named error rather than an HTTP exception so this module stays usable from
 * the pipeline and the agent tools; the route layer maps it to a 400.
 */
export class SectionIdExhaustedError extends Error {
  constructor(readonly pageId: string) {
    super(
      `Page ${pageId} has allocated all ${MAX_SECTION_SEQ} of its section ids. Split this page's content across pages, or re-extract it, before editing its sections further.`
    )
    this.name = "SectionIdExhaustedError"
  }
}

/**
 * Every section id that appears in *any* stored version of this page's
 * sectioning — the ids that are spent and must never be handed out again.
 *
 * Scanned out of the raw JSON rather than off parsed rows on purpose. A version
 * that no longer satisfies today's schema (a legacy row with no `sectionId`
 * field, a shape from before a migration) still burned the ids it contains, and
 * skipping it because `safeParse` failed would let them be reissued. Matching
 * text is a non-risk in the other direction: an incidental `_secNNN` inside
 * some node's text only makes the set larger, which can never cause reuse.
 *
 * The pattern admits the legacy `_sN` shape (`packages/agents` minted those
 * before it used this factory) as well as the canonical `_secNNN`, so a legacy
 * id also burns its sequence number instead of being invisible to the
 * high-water mark.
 *
 * `nodes` narrows the scan to particular sectioning nodes. Allocation always
 * wants both (an id spent under either shape must not be reissued); a caller
 * retiring the ids of one node that is about to be deleted passes just that one,
 * so it does not retire ids the surviving node still owns.
 */
export function collectSpentSectionIds(
  storage: Storage,
  pageId: string,
  nodes: readonly string[] = [PAGE_SECTIONING_NODE, FIXED_LAYOUT_SECTIONING_NODE]
): Set<string> {
  const spent = new Set<string>()
  const pattern = new RegExp(
    `${pageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_s(?:ec)?\\d+`,
    "g"
  )
  for (const node of nodes) {
    for (const row of storage.getAllNodeVersions(node, pageId)) {
      for (const match of JSON.stringify(row.data).matchAll(pattern)) {
        spent.add(match[0])
      }
    }
  }
  return spent
}

/**
 * The sequence number an id spent, or null if it belongs to another page.
 *
 * Legacy `${pageId}_s${N}` ids count too. Their N came from an array length, so
 * it is not a high-water mark — but it is still a number this page has used, and
 * counting it keeps a fresh canonical id from landing on the same sequence.
 */
function spentSeq(pageId: string, id: string): number | null {
  const parsed = parseAnySectionId(id)
  return parsed?.pageId === pageId ? parsed.seq : null
}

/**
 * Mint section ids that no version of this page's sectioning has ever used, so
 * a section's id is immutable for its whole life and a retired id is never
 * handed out again.
 *
 * The high-water mark comes from *history*, not just the current version. Delete
 * `_sec003`, then split `_sec002`, and a max-of-current counter would reissue
 * `_sec003` — silently adopting the deleted section's `toc-generation` entry,
 * sign-language video and text-catalog `${sectionId}_ans_*` keys (and therefore
 * their translations and generated audio) onto unrelated content.
 *
 * A counter stored on the entity would be worse: it would live inside the very
 * thing it counts, so restoring an older sectioning version would roll the
 * counter back and reissue every id allocated since.
 *
 * Every caller that adds a section must allocate through this — the structural
 * edit routes and the agent activity tools alike. An id derived from
 * `sections.length` is not just non-canonical, it collides: after a delete
 * leaves a gap, the next append reuses a length that is already taken.
 */
export function createSectionIdFactory(storage: Storage, pageId: string): () => string {
  let highWaterMark = 0
  for (const id of collectSpentSectionIds(storage, pageId)) {
    const seq = spentSeq(pageId, id)
    if (seq !== null) highWaterMark = Math.max(highWaterMark, seq)
  }
  let next = highWaterMark + 1
  return () => {
    if (next > MAX_SECTION_SEQ) {
      // Unreachable in practice: each structural op allocates one id, so this
      // needs ~1000 edits to a single page. Capped so the `_sec(\d{3})` shape
      // every consumer parses stays valid rather than silently widening.
      throw new SectionIdExhaustedError(pageId)
    }
    return formatSectionId(pageId, next++)
  }
}

/**
 * Clear the section assignment of every sign-language video pinned to one of
 * `retiredIds`, and report how many were cleared.
 *
 * Videos are *unassigned*, never deleted: the upload is the user's, and they can
 * reattach it to whatever section now carries that content.
 *
 * This is the only sectionId reference held in a *table* rather than in
 * `node_data` — no other table holds one. It is not, however, the only one that
 * survives an operation which drops a page's node history: the speech manifests
 * are keyed by *language*, so a per-page clear never reaches them either. See
 * `retireSectionIds`.
 */
export function unassignSignLanguageVideos(
  storage: Storage,
  retiredIds: Iterable<string>
): number {
  const retired = retiredIds instanceof Set ? retiredIds : new Set(retiredIds)
  if (retired.size === 0) return 0

  let unassigned = 0
  for (const video of storage.getSignLanguageVideos()) {
    if (video.sectionId && retired.has(video.sectionId)) {
      storage.assignSignLanguageVideo(video.videoId, null)
      unassigned += 1
    }
  }
  return unassigned
}

/** An uploaded recording whose entry was dropped, and where its file still is. */
export type DetachedRecording = {
  /** The `tts` row's item id — the language dir the file lives under, verbatim. */
  language: string
  fileName: string
}

/** What one retirement pass reconciled. */
export type SectionIdRetirementResult = {
  /** Sign-language video pins cleared. */
  videos: number
  /** `tts` manifest entries dropped, across every language. */
  speechEntries: number
  /**
   * The `provider: "manual"` entries among them — recordings the user uploaded.
   *
   * Reported rather than merely counted because the caller has to act on them.
   * Audio filenames are derived from the textId, so the same run that re-mints
   * a retired id also regenerates audio straight over the upload's path — unlike
   * a sign-language video, which is stored under its own `videoId` and survives
   * unassignment untouched. Dropping the entry alone would destroy the file.
   * Retirement itself does no file I/O; moving the upload out of the way is the
   * caller's job, because only the rerun path regenerates into the same names.
   */
  detachedRecordings: DetachedRecording[]
  /** `tts-timestamps` map entries dropped, across every language. */
  wordTimestamps: number
}

/** The result of retiring nothing. Frozen so callers can return it directly. */
export const NOTHING_RETIRED: SectionIdRetirementResult = Object.freeze({
  videos: 0,
  speechEntries: 0,
  detachedRecordings: Object.freeze([]) as unknown as DetachedRecording[],
  wordTimestamps: 0,
})

/**
 * Drop every speech reference to a retired section, across all languages.
 *
 * The `tts` manifest and `tts-timestamps` are keyed by language, not by page,
 * so neither a page-scoped history drop nor a stage rerun's clear reaches them:
 * `getStageRerunClearNodes` deliberately *preserves* `tts` whenever Speech is
 * in the rerun range, and `tts-timestamps` appears in no clear list at all
 * (`STAGE_OUTPUT_NODES` is built from step names, and the step is called
 * `word-timestamps` while the node is `tts-timestamps`). Both therefore outlive
 * the sectioning history their `${sectionId}_ans_*` ids came from.
 *
 * A *generated* entry heals itself — `canReuseSpeechEntry` gates it on
 * `computeSpeechCacheKey`, a hash of the text — but a `provider: "manual"` entry
 * is accepted on file existence alone, so a re-minted id would inherit a
 * recording of whatever content used to hold it. Timestamps are worse: with
 * `word_highlighting` off the speech run never rewrites them, so stale word
 * boundaries survive a full run and ship in the EPUB.
 *
 * Every entry for a retired id goes, not just the manual ones. Generated
 * entries are harmless but dangling, and dropping one costs a `copyFileSync`
 * rather than an API call because generation checks the on-disk cache before
 * the provider. One rule beats deciding per store which references are the
 * dangerous kind — that is the reasoning that let this survive in the first
 * place.
 *
 * Uploaded recordings are reported back rather than deleted; see
 * `detachedRecordings` for why they cannot simply be left where they are.
 *
 * Reading and writing back the same `itemId` `getNodeItemIds` returned is what
 * makes this correct for both the canonical (`pt-BR`) and legacy (`pt_BR`)
 * language row spellings without any alias juggling.
 */
function pruneSpeechForRetiredSections(
  storage: Storage,
  retiredIds: ReadonlySet<string>
): Omit<SectionIdRetirementResult, "videos"> {
  const ownedByRetiredSection = (textId: string): boolean => {
    const sectionId = sectionIdOfAnswerTextId(textId)
    return sectionId !== null && retiredIds.has(sectionId)
  }

  let speechEntries = 0
  let wordTimestamps = 0
  const detachedRecordings: DetachedRecording[] = []
  const generatedAt = new Date().toISOString()

  for (const itemId of storage.getNodeItemIds("tts")) {
    const row = storage.getLatestNodeData("tts", itemId)
    if (!row) continue
    // A row today's schema cannot read cannot be reconciled entry by entry, so
    // leave it rather than rewrite it into a shape nothing expects — but say so,
    // because this is a safety reconcile and skipping one fails *open*: any
    // stale manual entry inside stays reusable under a re-minted id.
    const parsed = TTSOutput.safeParse(row.data)
    if (!parsed.success) {
      console.warn(
        `[section-ids] tts/${itemId} does not satisfy the current schema; its entries were left as-is and may still reference retired sections.`
      )
      continue
    }

    // `failed` is pulled out of the rest rather than spread over, so emptying
    // it drops the key instead of leaving the original array behind.
    const { entries: priorEntries, failed: priorFailed, ...rest } = parsed.data
    const entries = priorEntries.filter((entry) => !ownedByRetiredSection(entry.textId))
    const failed = priorFailed?.filter((entry) => !ownedByRetiredSection(entry.textId))
    const droppedEntries = priorEntries.length - entries.length
    const droppedFailed = (priorFailed?.length ?? 0) - (failed?.length ?? 0)
    if (droppedEntries + droppedFailed === 0) continue

    speechEntries += droppedEntries
    for (const entry of priorEntries) {
      if (entry.provider === "manual" && ownedByRetiredSection(entry.textId)) {
        detachedRecordings.push({ language: itemId, fileName: entry.fileName })
      }
    }
    storage.putNodeData("tts", itemId, {
      ...rest,
      entries,
      ...(failed && failed.length > 0 ? { failed } : {}),
      generatedAt,
    })
  }

  for (const itemId of storage.getNodeItemIds("tts-timestamps")) {
    const row = storage.getLatestNodeData("tts-timestamps", itemId)
    if (!row) continue
    const parsed = WordTimestampOutput.safeParse(row.data)
    if (!parsed.success) {
      console.warn(
        `[section-ids] tts-timestamps/${itemId} does not satisfy the current schema; its entries were left as-is and may still reference retired sections.`
      )
      continue
    }

    const { entries: priorEntries, failed: priorFailed, ...rest } = parsed.data
    // Map keys are slot-qualified (`textId` / `textId--secondary`), so recover
    // the base textId before asking who owns it — otherwise the secondary
    // voice's timings outlive the section they describe.
    const entries = Object.fromEntries(
      Object.entries(priorEntries).filter(
        ([key]) => !ownedByRetiredSection(parseVoiceSlotEntryId(key).textId)
      )
    )
    const failed = priorFailed?.filter((entry) => !ownedByRetiredSection(entry.textId))
    const droppedEntries = Object.keys(priorEntries).length - Object.keys(entries).length
    const droppedFailed = (priorFailed?.length ?? 0) - (failed?.length ?? 0)
    if (droppedEntries + droppedFailed === 0) continue

    wordTimestamps += droppedEntries
    storage.putNodeData("tts-timestamps", itemId, {
      ...rest,
      entries,
      ...(failed && failed.length > 0 ? { failed } : {}),
      generatedAt,
    })
  }

  // Every other path that removes `tts` entries also invalidates the steps that
  // produced them (`easy-read.ts`, the version-restore reconcile in `pages.ts`,
  // `text-catalog.ts`). Without this, `spreads/apply` leaves Speech marked
  // complete over a manifest with holes — the rerun path clears step runs a
  // moment later anyway, so this only ever adds information.
  if (speechEntries > 0 || wordTimestamps > 0) {
    storage.clearStepRuns(["tts", "word-timestamps"])
  }

  return { speechEntries, detachedRecordings, wordTimestamps }
}

/**
 * Drop book-level references to sections that no longer exist, and report what
 * went. Called by every op that removes a section — and by the stage rerun that
 * drops a page's whole sectioning history; without it a merge or delete leaves a
 * dangling `toc-generation` entry (a broken href in the EPUB nav), a
 * sign-language video pinned to an id nothing resolves, or an uploaded recording
 * that a re-minted id would silently adopt.
 *
 * Which references each caller actually depends on differs, and it is worth
 * being exact about it:
 *
 * - The section-level ops (merge, cross-page merge, delete) reach this through
 *   `saveStoryboardNode`, whose `clearCaptionData` already deletes the `tts` and
 *   `tts-timestamps` nodes outright, so the speech prune finds nothing. It runs
 *   anyway rather than being conditioned on "something else will get it" — the
 *   reasoning that let the rerun path ship without it.
 * - `spreads/apply` retires before `deletePage`, and clears no manifests, so the
 *   prune is what stops a page re-created under the same id from adopting the
 *   old page's answer audio.
 * - The stage rerun likewise: `getStageRerunClearNodes` deliberately preserves
 *   `tts`, so the prune is the whole point there.
 *
 * Lives here rather than in the route that first needed it because retirement is
 * the other half of allocation: the same reasoning that says an id is never
 * reissued says its references must go when it retires, and both the structural
 * edit routes and the stage-rerun path have to agree on it. They previously
 * reconciled different sets of references, which is exactly how the speech
 * manifests came to be missed — so both now go through here.
 */
export function retireSectionIds(
  storage: Storage,
  retired: Iterable<string>
): SectionIdRetirementResult {
  const retiredIds = retired instanceof Set ? retired : new Set(retired)
  if (retiredIds.size === 0) return NOTHING_RETIRED

  const tocRow = storage.getLatestNodeData("toc-generation", "book")
  if (tocRow) {
    const parsed = TocGenerationOutput.safeParse(tocRow.data)
    if (parsed.success) {
      const entries = parsed.data.entries.filter((entry) => !retiredIds.has(entry.sectionId))
      if (entries.length !== parsed.data.entries.length) {
        storage.putNodeData("toc-generation", "book", { ...parsed.data, entries })
      }
    }
  }

  // Videos before the speech prune: nothing here is transactional, and the
  // prune is by far the larger failure surface (a write per language row, for
  // two nodes). Doing the one-UPDATE reconcile first keeps a failure in the big
  // one from also leaving videos pinned to ids that are about to be reissued.
  const videos = unassignSignLanguageVideos(storage, retiredIds)
  const speech = pruneSpeechForRetiredSections(storage, retiredIds)

  return { videos, ...speech }
}
