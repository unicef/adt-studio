import type { CommentAnchor } from "@/api/client"
import {
  contentRoot,
  resolveAnchorPoint,
} from "@/components/publication-feedback/lib/anchor-resolution"
import type { FeedbackThread } from "@/components/publication-feedback/lib/threads"
import { initialOf } from "@/components/publication-feedback/lib/initial"

/**
 * Placing published comments on the storyboard's own preview.
 *
 * The pins work here for a reason worth writing down: a comment's anchor is a CSS selector rooted
 * at `#content` plus a percentage offset, and the storyboard preview renders the *same structure
 * the export does* — same `#content`, same `data-id` / `data-section-id` hooks the packaging
 * pipeline stamps. So the anchor engine resolves against this iframe with no translation layer,
 * and `resolveAnchorPoint` already takes its root as an argument.
 *
 * That shared address is also the road to the thing this is ultimately for: the selector a
 * reviewer's pin carries is the same `data-id` the storyboard's own edit path writes to, so a
 * comment already names the node it is complaining about.
 */

export interface PlacedPin {
  thread: FeedbackThread
  /** Position relative to the container the overlay is drawn in. */
  x: number
  y: number
  /** What the pin shows: its author's initial, the same label the reader draws. */
  label: string
  /** The comment was written against an older published version of this section. */
  stale: boolean
}

export interface UnplacedPin {
  thread: FeedbackThread
  label: string
  stale: boolean
  /** Why it could not be drawn: the anchor is gone, or there never was one. */
  reason: "page-level" | "unresolvable"
}

export interface PlacementResult {
  placed: PlacedPin[]
  unplaced: UnplacedPin[]
}

/**
 * Resolve every thread of one section against the live preview DOM.
 *
 * Threads that cannot be placed are *returned*, never dropped: a comment whose element has since
 * been edited away is exactly the comment an author most needs to see, and silently losing it
 * would make the count in the rail disagree with what is on screen.
 */
export function placePins(
  threads: readonly FeedbackThread[],
  options: {
    doc: Document | null
    iframeRect: DOMRect | null
    containerRect: DOMRect | null
    /** The version currently published; anything older is marked stale. */
    liveVersion: number | null
  },
): PlacementResult {
  const placed: PlacedPin[] = []
  const unplaced: UnplacedPin[] = []

  const root = contentRoot(options.doc)
  const { iframeRect, containerRect } = options

  /**
   * The storyboard preview is CSS-scaled to fit its column — the iframe lays out at a device
   * width and is then transformed down. `getBoundingClientRect` reports the *scaled* box while an
   * anchor resolves in the iframe's own unscaled coordinates, so a pin has to be scaled by the
   * same factor or it drifts further from its element the further down the page it is. It was
   * doing exactly that, which also pushed the lower pins outside the frame and made them look
   * unplaceable.
   */
  const layoutWidth = options.doc?.documentElement.clientWidth ?? 0
  const scale =
    iframeRect !== null && layoutWidth > 0 ? iframeRect.width / layoutWidth : 1

  threads.forEach((thread) => {
    const label = initialOf(thread.root.author_name)
    const stale = options.liveVersion !== null && thread.version < options.liveVersion
    const anchor: CommentAnchor | null = thread.root.anchor

    if (anchor === null) {
      unplaced.push({ thread, label, stale, reason: "page-level" })
      return
    }
    if (root === null || iframeRect === null || containerRect === null) {
      unplaced.push({ thread, label, stale, reason: "unresolvable" })
      return
    }

    const point = resolveAnchorPoint(anchor, root)
    if (point === null) {
      unplaced.push({ thread, label, stale, reason: "unresolvable" })
      return
    }

    /** The anchor resolves in the iframe's own coordinates; the overlay is drawn in the
     *  container's, so the iframe's offset inside it has to be added back. */
    const x = iframeRect.left - containerRect.left + point.x * scale
    const y = iframeRect.top - containerRect.top + point.y * scale

    /** A pin outside the visible frame is not drawn on top of the page around it — the preview
     *  scales and clips, and a dot floating in the margin points at nothing. */
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x * scale > iframeRect.width ||
      point.y * scale > iframeRect.height
    ) {
      unplaced.push({ thread, label, stale, reason: "unresolvable" })
      return
    }

    placed.push({ thread, x, y, label, stale })
  })

  return { placed, unplaced }
}

/** The section id the storyboard's page + section index corresponds to, in the form the
 *  packaging pipeline stamps and every comment is keyed by. */
export function sectionIdFor(pageId: string, sectionIndex: number): string {
  return `${pageId}_sec${String(sectionIndex + 1).padStart(3, "0")}`
}

/**
 * The page and section a comment's `page_section_id` names.
 *
 * The inverse of `sectionIdFor`, and the reason a comment can be opened where it was left: a
 * thread carries `pg012_sec002` and nothing else, so without this the only honest destination
 * was the stage's own first page — which is where every comment used to lead.
 *
 * `null` for anything that is not in that shape rather than a guess, because a wrong page is
 * harder to recognise as wrong than no link at all.
 */
export function parseSectionId(
  sectionId: string,
): { pageId: string; sectionIndex: number } | null {
  const match = /^(.+)_sec(\d{3,})$/.exec(sectionId)
  if (match === null) return null
  const [, pageId, ordinal] = match
  const index = Number(ordinal) - 1
  if (pageId === undefined || !Number.isInteger(index) || index < 0) return null
  return { pageId, sectionIndex: index }
}

/**
 * A comment's location as two numbers, taken from the id that names it.
 *
 * There were three answers to "which page is this comment on" and they disagreed. The published
 * manifest carries the book's *printed* folio, which skips front matter — `pg012_sec002` is
 * labelled page 10 — and is absent entirely for the first pages, which read as "somewhere in the
 * book". The reader fell back to a position in the manifest, a third number again. Meanwhile the
 * storyboard, the route and the section's own filename all say 12.
 *
 * So the label is derived from the id rather than looked up: it is the one number that names the
 * same thing everywhere, including in the URL the author is sent to.
 */
export function sectionLocation(
  sectionId: string,
): { pageNumber: number; sectionNumber: number } | null {
  const parsed = parseSectionId(sectionId)
  if (parsed === null) return null
  const digits = /(\d+)\s*$/.exec(parsed.pageId)
  if (digits === null) return null
  const pageNumber = Number(digits[1])
  if (!Number.isInteger(pageNumber) || pageNumber <= 0) return null
  return { pageNumber, sectionNumber: parsed.sectionIndex + 1 }
}
