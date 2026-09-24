import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { PUBLISH_AUTHOR_DEFAULT_NAME } from "@adt/types"
import { buildThreads, filterThreads, type FeedbackThread } from "@/components/publication-feedback/lib/threads"
import { useBookPublication } from "@/hooks/use-book-publication"
import {
  publicationCommentsKey,
  useAuthorIdentity,
  usePublicationComments,
  useReplyToThread,
  useResolveThread,
} from "@/hooks/use-publication-feedback"
import { useHeldResolve } from "@/components/pipeline/stages/publish/dashboard/use-held-resolve"
import type { BookPreviewFrameHandle } from "../BookPreviewFrame"
import { placePins, type PlacedPin, type UnplacedPin } from "./storyboard-pins"
import { nextCommented, useBookComments, type CommentedSection } from "./use-book-comments"

/** How often the pins re-measure while comments are on. The preview reflows on its own — fonts
 *  land, images decode, the device width changes — and none of it fires an event this can watch,
 *  so a modest poll is both simpler and more reliable than guessing at the triggers. */
const REMEASURE_MS = 400
/** How long a loaded preview gets to settle before a pin that won't resolve is called missing.
 *  Until then "not found yet" is only "not measured yet", and saying "gone" would be a lie. */
const SETTLE_MS = 900
/** A preview whose document never reports "complete" — an image that keeps loading — still
 *  settles, this long after its document first appeared. */
const SETTLE_LIMIT_MS = 3000

export type CommentPin = PlacedPin | UnplacedPin

export function isPlaced(pin: CommentPin): pin is PlacedPin {
  return "x" in pin
}

/**
 * Everything the storyboard's comment layer knows about the section on screen: its threads, where
 * each one lands on the preview, which one is open, and answering and resolving it.
 */
export function useSectionComments({
  bookLabel,
  sectionId,
  pageSectionIds,
  enabled,
  frameRef,
  containerRef,
  selectedThreadId,
  onSelectThread,
}: {
  bookLabel: string
  sectionId: string
  /** Every section of the page, so the other sections' comments can be counted. */
  pageSectionIds: readonly string[]
  enabled: boolean
  frameRef: RefObject<BookPreviewFrameHandle | null>
  containerRef: RefObject<HTMLElement | null>
  selectedThreadId: string | null
  onSelectThread: (threadId: string | null) => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const book = useBookComments(bookLabel)
  const nextSection = nextCommented(book, sectionId)
  const status = useBookPublication(bookLabel)
  const published = status.data?.record !== null && status.data?.record !== undefined
  const comments = usePublicationComments(bookLabel, enabled && published)
  const identity = useAuthorIdentity(PUBLISH_AUTHOR_DEFAULT_NAME)
  const reply = useReplyToThread(bookLabel, identity.authorName)
  const resolveThread = useResolveThread(bookLabel, identity.authorName)
  const [tick, setTick] = useState(0)

  const all = useMemo(
    () => buildThreads(comments.data?.comments ?? []).filter((thread) => thread.root.deleted_at === null),
    [comments.data],
  )
  const threads = useMemo(
    () => filterThreads(all, { resolution: "unresolved", pageSectionId: sectionId }),
    [all, sectionId],
  )

  /** Waiting threads on the page's other sections, so the author knows there is more to see. */
  const elsewhere = useMemo(
    () =>
      pageSectionIds
        .map((id, index) => ({
          sectionId: id,
          index,
          count: filterThreads(all, { resolution: "unresolved", pageSectionId: id }).length,
        }))
        .filter((entry) => entry.sectionId !== sectionId && entry.count > 0),
    [all, pageSectionIds, sectionId],
  )

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setTick((value) => value + 1), REMEASURE_MS)
    return () => window.clearInterval(timer)
  }, [enabled])

  /** When this section's preview document first appeared, and when it first reported itself
   *  loaded; both reset on every section change. */
  const seen = useRef<{ sectionId: string; doc: number; loaded: number | null } | null>(null)
  const placement = useMemo(() => {
    void tick
    const doc = frameRef.current?.getDocument() ?? null
    const now = Date.now()
    if (doc === null) seen.current = null
    else if (seen.current?.sectionId !== sectionId) seen.current = { sectionId, doc: now, loaded: null }
    if (seen.current && seen.current.loaded === null && doc?.readyState === "complete") seen.current.loaded = now
    const settled =
      seen.current !== null &&
      ((seen.current.loaded !== null && now - seen.current.loaded >= SETTLE_MS) || now - seen.current.doc >= SETTLE_LIMIT_MS)
    const result = placePins(threads, {
      doc,
      iframeRect: frameRef.current?.getIframeRect() ?? null,
      containerRect: containerRef.current?.getBoundingClientRect() ?? null,
      liveVersion: status.data?.publication?.current_version ?? null,
    })
    const unplaced = result.unplaced.map((pin) =>
      !settled && pin.reason === "unresolvable" ? { ...pin, reason: "measuring" as const } : pin,
    )
    return { placed: result.placed, unplaced, settled }
  }, [threads, tick, status.data, frameRef, containerRef, sectionId])

  /** Top to bottom, the way the page reads; comments with no place on it come last. */
  const ordered = useMemo<CommentPin[]>(
    () => [
      ...[...placement.placed].sort((a, b) => a.y - b.y || a.x - b.x),
      ...placement.unplaced.filter((pin) => pin.reason !== "measuring"),
    ],
    [placement],
  )
  const measuring = placement.unplaced.filter((pin) => pin.reason === "measuring")

  const resolve = useCallback(
    async (id: string, resolved: boolean) => {
      await resolveThread.mutateAsync({ id, resolved })
      await queryClient.invalidateQueries({ queryKey: publicationCommentsKey(bookLabel) })
    },
    [bookLabel, queryClient, resolveThread],
  )
  const held = useHeldResolve(resolve)

  const selected =
    [...placement.placed, ...placement.unplaced].find((pin) => pin.thread.root.id === selectedThreadId) ?? null
  const index = selected ? ordered.findIndex((pin) => pin.thread.root.id === selected.thread.root.id) : -1
  const step = (by: number) => {
    if (ordered.length === 0) return
    const next = ordered[(Math.max(0, index) + by + ordered.length) % ordered.length]
    onSelectThread(next.thread.root.id)
  }

  return {
    published,
    loading: comments.isPending && enabled && published,
    failed: comments.isError && comments.data === undefined,
    threads,
    placed: placement.placed,
    ordered,
    measuring,
    elsewhere,
    /** The next section in the book with comments waiting, and a way there that opens its
     *  newest comment. */
    nextSection,
    goTo: (entry: CommentedSection) =>
      void navigate({
        to: "/books/$label/$step/$pageId",
        params: { label: bookLabel, step: "storyboard", pageId: entry.pageId },
        search: { section: entry.sectionIndex, comment: entry.latestThreadId },
      }),
    selected,
    index,
    next: () => step(1),
    previous: () => step(-1),
    select: onSelectThread,
    reply: async (thread: FeedbackThread, body: string) => {
      await reply.mutateAsync({ parentId: thread.root.id, pageSectionId: thread.pageSectionId, body })
    },
    replying: reply.isPending,
    held,
    reopen: (id: string) => void resolve(id, false).catch(() => undefined),
  }
}

export type SectionComments = ReturnType<typeof useSectionComments>
