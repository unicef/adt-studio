import type { CommentAnchor } from "@/api/client"
import {
  contentRoot,
  resolveAnchorPoint,
} from "@/components/pipeline/stages/feedback/lib/anchor-resolution"
import type { FeedbackThread } from "@/components/pipeline/stages/feedback/lib/threads"

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
  /** Sequence number shown in the pin, stable per section. */
  number: number
  /** The comment was written against an older published version of this section. */
  stale: boolean
}

export interface UnplacedPin {
  thread: FeedbackThread
  number: number
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

  threads.forEach((thread, index) => {
    const number = index + 1
    const stale = options.liveVersion !== null && thread.version < options.liveVersion
    const anchor: CommentAnchor | null = thread.root.anchor

    if (anchor === null) {
      unplaced.push({ thread, number, stale, reason: "page-level" })
      return
    }
    if (root === null || iframeRect === null || containerRect === null) {
      unplaced.push({ thread, number, stale, reason: "unresolvable" })
      return
    }

    const point = resolveAnchorPoint(anchor, root)
    if (point === null) {
      unplaced.push({ thread, number, stale, reason: "unresolvable" })
      return
    }

    /** The anchor resolves in the iframe's own coordinates; the overlay is drawn in the
     *  container's, so the iframe's offset inside it has to be added back. */
    const x = iframeRect.left - containerRect.left + point.x
    const y = iframeRect.top - containerRect.top + point.y

    /** A pin outside the visible frame is not drawn on top of the page around it — the preview
     *  scales and clips, and a dot floating in the margin points at nothing. */
    if (point.x < 0 || point.y < 0 || point.x > iframeRect.width || point.y > iframeRect.height) {
      unplaced.push({ thread, number, stale, reason: "unresolvable" })
      return
    }

    placed.push({ thread, x, y, number, stale })
  })

  return { placed, unplaced }
}

/** The section id the storyboard's page + section index corresponds to, in the form the
 *  packaging pipeline stamps and every comment is keyed by. */
export function sectionIdFor(pageId: string, sectionIndex: number): string {
  return `${pageId}_sec${String(sectionIndex + 1).padStart(3, "0")}`
}
