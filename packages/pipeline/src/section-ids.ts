import type { Storage } from "@adt/storage"
import { formatSectionId, parseAnySectionId, MAX_SECTION_SEQ, TocGenerationOutput } from "@adt/types"
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
 * This is the one sectionId reference that lives outside `node_data` — no other
 * table holds one — so it is the only one that survives an operation which drops
 * a page's node history. Everything else keyed by sectionId (`toc-generation`,
 * `text-catalog` and the audio derived from it, `editable-activity`) goes with
 * that history.
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

/**
 * Drop book-level references to sections that no longer exist. Called by every
 * op that removes a section; without it a merge or delete leaves a dangling
 * `toc-generation` entry (a broken href in the EPUB nav) or a sign-language
 * video pinned to an id nothing resolves.
 *
 * Lives here rather than in the route that first needed it because retirement is
 * the other half of allocation: the same reasoning that says an id is never
 * reissued says its references must go when it retires, and both the structural
 * edit routes and the stage-rerun path have to agree on it.
 */
export function retireSectionIds(storage: Storage, retired: string[]): void {
  if (retired.length === 0) return
  const retiredIds = new Set(retired)

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

  unassignSignLanguageVideos(storage, retiredIds)
}
