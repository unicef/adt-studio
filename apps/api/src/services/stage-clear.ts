import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import {
  PIPELINE,
  TTSOutput,
  WordTimestampOutput,
  getStageClearOrder,
  getStageRerunClearNodes,
  parseVoiceSlotEntryId,
  sectionIdOfAnswerTextId,
  type PipelineNodeName,
  type StageName,
} from "@adt/types"
import {
  collectSpentSectionIds,
  retireSectionIds,
  NOTHING_RETIRED,
  PAGE_SECTIONING_NODE,
} from "@adt/pipeline"
import type { SectionIdRetirementResult } from "@adt/pipeline"
import { retireWithPreservedRecordings, DETACHED_AUDIO_DIR } from "./detached-audio.js"

export interface StageClearPlan {
  /** Node types whose stored output this run will delete. */
  nodes: PipelineNodeName[]
  /** Stages whose completion state this run will reset. */
  stages: StageName[]
  /** True when the run restarts from extraction and drops every extracted page. */
  clearsExtractedData: boolean
}

/**
 * What starting a run at `fromStage` will destroy. Computed without touching
 * the book so it can be shown for approval before anything runs.
 */
export function planStageClear(fromStage: StageName, toStage: StageName): StageClearPlan {
  if (fromStage === "extract") {
    return { nodes: [], stages: getStageClearOrder(fromStage), clearsExtractedData: true }
  }
  return {
    nodes: getStageRerunClearNodes(fromStage, toStage),
    stages: getStageClearOrder(fromStage),
    clearsExtractedData: false,
  }
}

/**
 * Does this rerun delete the `page-sectioning` history that section ids are
 * allocated from?
 *
 * Only that node. `fixed-layout-sectioning` is cleared by a storyboard rerun
 * too, but its id is not allocated — `sectionFixedLayoutPage` derives the page's
 * single section id from the pageId alone, so regenerating it produces the same
 * id and nothing pinned to it was ever at risk. Retiring those ids would detach
 * every pinned video on each storyboard rerun of a fixed-layout book, and on a
 * reflowable book carrying a stale fixed-layout row it would retire a `_sec001`
 * the live `page-sectioning` still owns.
 */
function clearsSectionIdHistory(fromStage: StageName, toStage: StageName): boolean {
  // `clearExtractedData` drops every node except the font ones, sectioning included.
  if (fromStage === "extract") return true
  const cleared: string[] = getStageRerunClearNodes(fromStage, toStage)
  return cleared.includes(PAGE_SECTIONING_NODE)
}

/**
 * Does any speech manifest hold audio keyed to a section at all?
 *
 * Only `${sectionId}_ans_*` entries can ever be retired, so a book whose audio
 * is all page text, glossary and quiz content has nothing at stake no matter how
 * its sections are renumbered. Reads the rows rather than merely checking that
 * they exist, which is what makes the fast path below still worth having.
 */
function hasAnswerSpeechEntries(storage: Storage): boolean {
  const isAnswer = (textId: string): boolean => sectionIdOfAnswerTextId(textId) !== null
  for (const itemId of storage.getNodeItemIds("tts")) {
    const parsed = TTSOutput.safeParse(storage.getLatestNodeData("tts", itemId)?.data)
    // An unreadable row cannot be ruled out, so treat it as a reason to look.
    if (!parsed.success) return true
    // `failed` counts as much as `entries`: the prune reconciles both, so a row
    // whose only answer reference is a failed item still has work to do.
    if (parsed.data.entries.some((entry) => isAnswer(entry.textId))) return true
    if (parsed.data.failed?.some((entry) => isAnswer(entry.textId))) return true
  }
  for (const itemId of storage.getNodeItemIds("tts-timestamps")) {
    const parsed = WordTimestampOutput.safeParse(
      storage.getLatestNodeData("tts-timestamps", itemId)?.data
    )
    if (!parsed.success) return true
    if (
      Object.keys(parsed.data.entries).some((key) =>
        isAnswer(parseVoiceSlotEntryId(key).textId)
      )
    ) {
      return true
    }
    if (parsed.data.failed?.some((entry) => isAnswer(entry.textId))) return true
  }
  return false
}

/**
 * Retire every sectionId a rerun is about to invalidate, and report what that
 * reconciled.
 *
 * Clearing a stage deletes *every* version of the nodes it clears. When
 * `page-sectioning` is among them the section-id high-water mark goes with it,
 * so the re-section re-mints densely from `_sec001` and hands out ids that named
 * different content a moment ago.
 *
 * That is only harmful while something still points at the old ids, and the
 * clear does not reach everything:
 *
 * - `sign_language_videos.section_id` lives in a table, not `node_data`, so a
 *   pinned video would reappear on whatever unrelated section inherits its id.
 * - The speech manifests are keyed by *language*, not by page. `tts` is
 *   deliberately preserved by `getStageRerunClearNodes` whenever Speech is in
 *   the rerun range, and `tts-timestamps` is in no clear list at all — the node
 *   name differs from the `word-timestamps` step name that
 *   `STAGE_OUTPUT_NODES` is derived from. Generated audio still heals itself on
 *   `computeSpeechCacheKey`, but `canReuseSpeechEntry` accepts a
 *   `provider: "manual"` entry on file existence alone, so a re-minted id would
 *   inherit a recording of the old content.
 *
 * Retiring here is what makes the dense re-mint safe. Everything else keyed by
 * sectionId (`toc-generation`, `text-catalog`, `editable-activity`) is deleted
 * by the same clear.
 *
 * Nothing the user uploaded is deleted, as in the structural edit routes: a
 * video is unassigned in place, and a recording is backed up by the caller (see
 * `retireWithPreservedRecordings`, which is needed because audio filenames — unlike
 * video paths — are derived from the very id being reissued). Same shape as the
 * `spreads/apply` reconcile, which retires ids before `deletePage` drops the
 * history for the identical reason — and it goes through the same
 * `retireSectionIds`, because the two paths previously reconciled different
 * reference sets and that divergence is how the speech manifests were missed.
 *
 * Must run *before* the clear: it reads the sectioning history the ids come
 * from, and the `pages` table itself, both of which the extract branch deletes.
 * The pruned `tts` version it writes has to survive that clear, which it does
 * precisely because neither speech node is in `getStageRerunClearNodes`. On the
 * extract branch `clearExtractedData` does delete them, making the write moot —
 * but not special-cased, because "the clear will get it anyway" is the reasoning
 * that produced the stale claim this doc comment replaces.
 */
export function retireSectionIdsForClearedSectioning(
  storage: Storage,
  fromStage: StageName,
  toStage: StageName
): SectionIdRetirementResult {
  if (!clearsSectionIdHistory(fromStage, toStage)) return NOTHING_RETIRED
  // Scanning every stored sectioning version of every page is not free —
  // `JSON.stringify` plus a global regex per version — so establish that
  // *something* could be retired before paying for it. "Any book that has run
  // speech" would be too coarse a guard to be worth having: the manifests are
  // small and in memory, so ask them whether they hold any answer audio at all.
  if (
    !storage.getSignLanguageVideos().some((video) => video.sectionId !== null) &&
    !hasAnswerSpeechEntries(storage)
  ) {
    return NOTHING_RETIRED
  }

  const retired = new Set<string>()
  for (const page of storage.getPages()) {
    for (const id of collectSpentSectionIds(storage, page.pageId, [PAGE_SECTIONING_NODE])) {
      retired.add(id)
    }
  }
  // Page-scoped by construction, so glossary assignments (`gl001`…) are untouched.
  return retireSectionIds(storage, retired)
}

/**
 * Build a beforeRun callback that clears downstream data for a stage.
 * The returned function is idempotent — only runs once even if called multiple times.
 */
export function makeBeforeRun(
  label: string,
  fromStage: StageName,
  toStage: StageName,
  booksDir: string,
): () => void {
  let ran = false
  return () => {
    if (ran) return
    const storage = createBookStorage(label, booksDir)
    try {
      const { retired, preserved } = retireWithPreservedRecordings(
        storage,
        path.join(path.resolve(booksDir), label),
        () => retireSectionIdsForClearedSectioning(storage, fromStage, toStage)
      )
      // A failed preservation rolls retirement back and must remain retryable.
      ran = true
      if (retired.videos > 0) {
        console.warn(
          `[stages] ${label}: unassigned ${retired.videos} sign-language video(s) — the sections they were pinned to are being regenerated. The uploads are kept and can be reattached.`
        )
      }
      if (retired.detachedRecordings.length > 0) {
        console.warn(
          `[stages] ${label}: detached ${retired.detachedRecordings.length} uploaded audio recording(s) — the sections their text belonged to are being regenerated, so the recordings no longer match. ${preserved.length} file(s) backed up to ${DETACHED_AUDIO_DIR}/ so this run cannot overwrite the backups; re-upload the ones you still want.`
        )
      }

      if (fromStage === "extract") {
        // clearExtractedData also clears step_runs
        storage.clearExtractedData()
      } else {
        const nodes = getStageRerunClearNodes(fromStage, toStage)
        if (nodes.length > 0) {
          storage.clearNodesByType(nodes)
        }
        if (fromStage === "storyboard" && typeof storage.clearDebugImages === "function") {
          storage.clearDebugImages()
        }
        // Clear step run records for all downstream stages
        const stagesToClear = getStageClearOrder(fromStage)
        const stepsToClear = PIPELINE
          .filter((s) => stagesToClear.includes(s.name))
          .flatMap((s) => s.steps.map((step) => step.name))
        storage.clearStepRuns(stepsToClear)
      }
    } finally {
      storage.close()
    }
  }
}
