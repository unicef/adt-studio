import { useEffect, useMemo, useState, type RefObject } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { MessagesSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { buildThreads, filterThreads } from "@/components/pipeline/stages/feedback/lib/threads"
import { usePublicationComments } from "@/hooks/use-publication-feedback"
import { useBookPublication } from "@/hooks/use-book-publication"
import type { BookPreviewFrameHandle } from "../BookPreviewFrame"
import { placePins, type PlacedPin, type UnplacedPin } from "./storyboard-pins"
import { StoryboardThreadPopover } from "./StoryboardThreadPopover"

/** How often the pins re-measure while the overlay is on. The preview reflows on its own — fonts
 *  land, images decode, the device width changes — and none of it fires an event this can watch,
 *  so a modest poll is both simpler and more reliable than guessing at the triggers. */
const REMEASURE_MS = 400

interface StoryboardFeedbackOverlayProps {
  bookLabel: string
  /** The section on screen, in the form comments are keyed by. */
  sectionId: string
  frameRef: RefObject<BookPreviewFrameHandle | null>
  containerRef: RefObject<HTMLElement | null>
  /** Off by default: an author styling a page should not have reviewer dots in the way until
   *  they ask for them. */
  enabled: boolean
  showResolved: boolean
  /** Selection is lifted so a pin and its row in the sidebar are one thing, not two that can
   *  disagree about which comment is open. */
  selectedThreadId: string | null
  onSelectThread: (threadId: string | null) => void
  /** Reported upward so the sidebar can mark rows whose pin could not be drawn. */
  onMissingPinsChange?: (ids: string[]) => void
}

/**
 * Reviewer comments, pinned on the storyboard's own preview.
 *
 * This is the point of moving feedback out of a stage of its own: the comment and the thing it is
 * about are finally on the same screen, so acting on it is editing what is already in front of
 * you rather than remembering a sentence from another page.
 *
 * Pins that cannot be placed are listed rather than dropped — see `placePins`. A comment whose
 * element has been edited away is precisely the one an author needs to see.
 */
export function StoryboardFeedbackOverlay({
  bookLabel,
  sectionId,
  frameRef,
  containerRef,
  enabled,
  showResolved,
  selectedThreadId,
  onSelectThread,
  onMissingPinsChange,
}: StoryboardFeedbackOverlayProps) {
  const { t } = useLingui()
  const status = useBookPublication(bookLabel)
  const published = status.data?.record !== null && status.data?.record !== undefined
  const comments = usePublicationComments(bookLabel, enabled && published)
  const [tick, setTick] = useState(0)

  const threads = useMemo(() => {
    const all = buildThreads(comments.data?.comments ?? [])
    return filterThreads(all, {
      resolution: showResolved ? "all" : "unresolved",
      pageSectionId: sectionId,
    }).sort((a, b) => Date.parse(a.root.created_at) - Date.parse(b.root.created_at))
  }, [comments.data, sectionId, showResolved])

  /** Re-measure on a timer while the overlay is on, and once immediately when the threads or the
   *  section change so a freshly opened page does not wait a frame for its pins. */
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setTick((value) => value + 1), REMEASURE_MS)
    return () => window.clearInterval(timer)
  }, [enabled])

  const { placed, unplaced } = useMemo(() => {
    void tick
    return placePins(threads, {
      doc: frameRef.current?.getDocument() ?? null,
      iframeRect: frameRef.current?.getIframeRect() ?? null,
      containerRect: containerRef.current?.getBoundingClientRect() ?? null,
      liveVersion: status.data?.publication?.current_version ?? null,
    })
  }, [threads, tick, status.data, frameRef, containerRef])

  /** Synced through an effect rather than reported from the render that computed it: the parent
   *  cannot be told to re-render while this one is still rendering. Keyed on the joined ids so a
   *  re-measure that changes nothing does not loop. */
  const missingKey = unplaced.map((pin) => pin.thread.root.id).join(",")
  useEffect(() => {
    onMissingPinsChange?.(missingKey === "" ? [] : missingKey.split(","))
  }, [missingKey, onMissingPinsChange])

  if (!enabled || !published) return null

  const open =
    [...placed, ...unplaced].find((pin) => pin.thread.root.id === selectedThreadId) ?? null

  return (
    <>
      {/* The layer itself takes no clicks — the author is still styling the page underneath it.
          Only the pins do. */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {placed.map((pin) => (
          <button
            key={pin.thread.root.id}
            type="button"
            data-testid={`storyboard-pin-${pin.thread.root.id}`}
            aria-label={t`Comment ${pin.number} by ${pin.thread.root.author_name}`}
            onClick={() =>
              onSelectThread(selectedThreadId === pin.thread.root.id ? null : pin.thread.root.id)
            }
            style={{
              left: `${pin.x}px`,
              top: `${pin.y}px`,
              backgroundColor: pin.thread.root.author_color,
            }}
            className={cn(
              "pointer-events-auto absolute flex size-6 -translate-x-1/2 -translate-y-full items-center justify-center",
              "rounded-full rounded-bl-none text-[11px] font-bold text-white shadow-md ring-2 ring-white",
              "transition-transform duration-150 hover:scale-110 focus:outline-none",
              "focus-visible:ring-4 focus-visible:ring-indigo-300 motion-reduce:transition-none",
              selectedThreadId === pin.thread.root.id && "scale-110 ring-4 ring-indigo-300",
              pin.thread.resolved && "opacity-60 saturate-50",
            )}
          >
            {pin.number}
          </button>
        ))}
      </div>

      {/* Comments with nowhere to sit. Stacked in a corner rather than hidden, because a pin the
          overlay cannot place is still feedback somebody is waiting on. */}
      {unplaced.length > 0 ? (
        <div className="absolute bottom-3 left-3 z-20 flex max-w-[16rem] flex-col gap-1.5">
          {unplaced.map((pin) => (
            <button
              key={pin.thread.root.id}
              type="button"
              data-testid={`storyboard-unplaced-${pin.thread.root.id}`}
              onClick={() =>
                onSelectThread(selectedThreadId === pin.thread.root.id ? null : pin.thread.root.id)
              }
              className="flex items-center gap-2 rounded-lg border bg-card/95 px-2 py-1.5 text-left shadow-sm backdrop-blur-sm transition-colors hover:bg-muted"
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: pin.thread.root.author_color }}
                className="flex size-5 shrink-0 items-center justify-center rounded-full rounded-bl-none text-[10px] font-bold text-white"
              >
                {pin.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {pin.reason === "page-level" ? (
                  <Trans>On the whole page</Trans>
                ) : (
                  <Trans>Its place on the page is gone</Trans>
                )}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <StoryboardThreadPopover
          bookLabel={bookLabel}
          pin={open}
          onClose={() => onSelectThread(null)}
        />
      ) : null}
    </>
  )
}

/** The count the storyboard's own chrome shows, so the toggle can say how much is waiting on this
 *  section without the overlay being on. */
export function useSectionFeedbackCount(bookLabel: string, sectionId: string): number {
  const status = useBookPublication(bookLabel)
  const published = status.data?.record !== null && status.data?.record !== undefined
  const comments = usePublicationComments(bookLabel, published)

  return useMemo(() => {
    const all = buildThreads(comments.data?.comments ?? [])
    return filterThreads(all, { resolution: "unresolved", pageSectionId: sectionId }).length
  }, [comments.data, sectionId])
}

export type { PlacedPin, UnplacedPin }
export { MessagesSquare as FeedbackToggleIcon }
