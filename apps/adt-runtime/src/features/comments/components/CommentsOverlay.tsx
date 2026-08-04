import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { announceToScreenReader } from "@/shared/lib/aria-live"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import { repliesOf, rootComments, type PublishComment } from "@/features/comments/lib/contract"
import { anchorForElement, resolveAnchor } from "@/features/comments/lib/anchor"
import { scrollBehavior } from "@/features/comments/lib/motion"
import { useAnchorPositions, type AnchorTarget } from "@/features/comments/hooks/useAnchorPositions"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { useCommentActions } from "@/features/comments/hooks/useCommentActions"
import { useContentWalker } from "@/features/comments/hooks/useContentWalker"
import { usePinDrag } from "@/features/comments/hooks/usePinDrag"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import {
  commentDraftAtom,
  commentModeAtom,
  commentsAtom,
  commentsSessionAtom,
  flashedPinIdAtom,
  openThreadIdAtom,
  pinDragAtom,
  settlingPinIdAtom,
  sidebarOpenAtom,
} from "@/features/comments/state/comments.atoms"
import { CommentForm } from "@/features/comments/components/CommentForm"
import { CommentPin } from "@/features/comments/components/CommentPin"
import { CommentPreview } from "@/features/comments/components/CommentPreview"
import { CommentThread } from "@/features/comments/components/CommentThread"
import { CommentsSidebar } from "@/features/comments/components/CommentsSidebar"
import { PointPopover } from "@/features/comments/components/PointPopover"

const DRAFT_COLOR = "#0091ff"

/** Long enough that a pin brushed on the way somewhere else stays quiet. */
const PREVIEW_DELAY_MS = 250

const SETTLE_MS = 480

const FLASH_MS = 1900

/** Page-level threads (never anchored, or anchored to markup that no longer
 *  resolves) stack in the corner instead of vanishing. The sidebar is their
 *  proper home; this stack is the on-page reminder that they exist. */
const PAGE_STACK_TOP = 24

/** The pin is drawn from its left edge, so this is 28px of pin plus a margin —
 *  otherwise the corner stack hangs off the right edge and gets clipped. */
const PAGE_STACK_RIGHT = 44

const PAGE_STACK_STEP = 34

export interface CommentsOverlayProps {
  context: CommentsRuntimeContext
  refresh: () => Promise<void>
}

export function CommentsOverlay({ context, refresh }: CommentsOverlayProps) {
  const { t } = useCommentsText()
  const comments = useAtomValue(commentsAtom)
  const session = useAtomValue(commentsSessionAtom)
  const sectionId = useAtomValue(currentSectionIdAtom)
  const [draft, setDraft] = useAtom(commentDraftAtom)
  const [openThreadId, setOpenThreadId] = useAtom(openThreadIdAtom)
  const [commentMode, setCommentMode] = useAtom(commentModeAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)
  const drag = useAtomValue(pinDragAtom)
  const [settlingId, setSettling] = useAtom(settlingPinIdAtom)
  const [flashedId, setFlashed] = useAtom(flashedPinIdAtom)

  const [movingId, setMovingId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewTimer = useRef<number | null>(null)
  const originRef = useRef<HTMLElement | null>(null)
  const pinRefs = useRef(new Map<string, HTMLButtonElement>())

  const actions = useCommentActions(context, refresh)

  const roots = useMemo(() => rootComments(comments), [comments])

  const targets = useMemo<AnchorTarget[]>(
    () => roots.map((comment) => ({ id: comment.id, anchor: comment.anchor })),
    [roots],
  )
  const positions = useAnchorPositions(targets)

  const draftTargets = useMemo<AnchorTarget[]>(
    () => (draft?.anchor ? [{ id: "draft", anchor: draft.anchor }] : []),
    [draft],
  )
  const draftPositions = useAnchorPositions(draftTargets)
  const draftPoint = draftPositions.get("draft") ?? (draft ? { x: draft.x, y: draft.y } : null)

  const anchoredIds = useMemo(() => new Set(positions.keys()), [positions])

  const closeDraft = useCallback(() => setDraft(null), [setDraft])

  /**
   * Closing a thread hands focus back to wherever it came from — and when that
   * is gone, to the thread's own pin. The gone case is the common one: a comment
   * posted from the keyboard opens its thread immediately, and the element the
   * reviewer was standing on has since given its tabindex back.
   */
  const closeThread = useCallback(() => {
    const id = openThreadId
    setOpenThreadId(null)
    requestAnimationFrame(() => {
      const origin = originRef.current
      if (origin?.isConnected && origin.offsetParent !== null) {
        origin.focus()
        return
      }
      if (id) pinRefs.current.get(id)?.focus()
    })
  }, [openThreadId, setOpenThreadId])

  const rememberOrigin = useCallback(() => {
    const active = document.activeElement
    originRef.current = active instanceof HTMLElement ? active : null
  }, [])

  const clearPreview = useCallback(() => {
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current)
      previewTimer.current = null
    }
    setPreviewId(null)
  }, [])

  /**
   * Bring a pin's anchor into view when the pin takes focus.
   *
   * Pins are on a fixed overlay, so a pin whose anchor has scrolled away is
   * drawn off-screen — and the browser cannot scroll a fixed element into view.
   * Without this, tabbing onto a pin would move focus somewhere invisible, which
   * is the worst thing a focus ring can do.
   */
  const revealPin = useCallback(
    (comment: PublishComment) => {
      const point = positions.get(comment.id)
      if (!point) return
      const margin = 96
      if (point.y > margin && point.y < window.innerHeight - margin) return
      const resolved = comment.anchor ? resolveAnchor(comment.anchor) : null
      resolved?.element.scrollIntoView({ block: "center", behavior: scrollBehavior() })
    },
    [positions],
  )

  const schedulePreview = useCallback(
    (id: string) => {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current)
      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = null
        setPreviewId(id)
      }, PREVIEW_DELAY_MS)
    },
    [],
  )

  const { handlersFor, consumeSuppressedClick } = usePinDrag({
    onDrop: (id, anchor) => {
      clearPreview()
      void actions.move(id, anchor)
    },
  })

  const commitKeyboardAnchor = useCallback(
    (element: Element) => {
      const anchored = anchorForElement(element)
      if (!anchored) return
      if (movingId) {
        const id = movingId
        setMovingId(null)
        void actions.move(id, anchored.anchor)
        return
      }
      setOpenThreadId(null)
      setDraft({ anchor: anchored.anchor, x: anchored.point.x, y: anchored.point.y })
    },
    [actions, movingId, setDraft, setOpenThreadId],
  )

  const cancelKeyboardAnchor = useCallback(() => {
    if (movingId) {
      setMovingId(null)
      announceToScreenReader(t("comments-move-cancelled-label"))
      return
    }
    setCommentMode(false)
  }, [movingId, setCommentMode, t])

  const walkerActive = ((commentMode as boolean) && !draft) || movingId !== null
  const walker = useContentWalker({
    active: walkerActive,
    onCommit: commitKeyboardAnchor,
    onCancel: cancelKeyboardAnchor,
  })

  const phaseRef = useRef<"idle" | "place" | "move">("idle")
  const rootsRef = useRef(roots)
  rootsRef.current = roots
  const walkerRef = useRef(walker)
  walkerRef.current = walker
  const textRef = useRef(t)
  textRef.current = t

  /**
   * One announcement per *change* of phase. Keyed off refs for everything but
   * the phase itself: a refetch changes `roots` on every reply, and a live region
   * that repeats "use the arrow keys" each time is worse than silence.
   */
  useEffect(() => {
    const phase = movingId ? "move" : (commentMode as boolean) ? "place" : "idle"
    if (phase === phaseRef.current) return
    phaseRef.current = phase
    if (phase === "move") {
      const comment = rootsRef.current.find((candidate) => candidate.id === movingId)
      const element = comment?.anchor ? resolveAnchor(comment.anchor)?.element : null
      announceToScreenReader(textRef.current("comments-move-instructions-label"))
      // A frame later than the thread popover's own focus restore, which would
      // otherwise pull focus off the element the reviewer is about to move from.
      requestAnimationFrame(() => walkerRef.current.focusElement(element ?? null))
      return
    }
    if (phase === "place") {
      announceToScreenReader(textRef.current("comments-placement-instructions-label"))
    }
  }, [commentMode, movingId])

  useEffect(() => {
    if (!settlingId) return
    const timer = window.setTimeout(() => setSettling(null), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [settlingId, setSettling])

  useEffect(() => {
    if (!flashedId) return
    const timer = window.setTimeout(() => setFlashed(null), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flashedId, setFlashed])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (draft) {
        setDraft(null)
        return
      }
      if (openThreadId) closeThread()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [closeThread, draft, openThreadId, setDraft])

  const onRootPosted = useCallback(
    async (comment: PublishComment) => {
      setDraft(null)
      setCommentMode(false)
      await refresh()
      setOpenThreadId(comment.id)
      setSettling(comment.id)
      announceToScreenReader(t("comments-posted-label"))
    },
    [refresh, setCommentMode, setDraft, setOpenThreadId, setSettling, t],
  )

  const openThread = useCallback(
    (comment: PublishComment) => {
      rememberOrigin()
      clearPreview()
      setDraft(null)
      setOpenThreadId((current) => (current === comment.id ? null : comment.id))
    },
    [clearPreview, rememberOrigin, setDraft, setOpenThreadId],
  )

  const selectFromSidebar = useCallback(
    (comment: PublishComment) => {
      rememberOrigin()
      clearPreview()
      setDraft(null)
      if (comment.anchor) {
        const resolved = resolveAnchor(comment.anchor)
        resolved?.element.scrollIntoView({ block: "center", behavior: scrollBehavior() })
        if (resolved) setFlashed(comment.id)
      }
      setOpenThreadId(comment.id)
    },
    [clearPreview, rememberOrigin, setDraft, setFlashed, setOpenThreadId],
  )

  const openRoot = openThreadId
    ? (roots.find((comment) => comment.id === openThreadId) ?? null)
    : null

  const openRootPoint = openRoot ? pointFor(openRoot, roots, positions) : null

  const previewComment = useMemo(() => {
    if (!previewId || draft || openThreadId || drag) return null
    return roots.find((comment) => comment.id === previewId) ?? null
  }, [draft, drag, openThreadId, previewId, roots])

  const previewPoint = previewComment ? pointFor(previewComment, roots, positions) : null

  /** Mirrors the sidebar's own `w-80 max-w-[85vw]`. */
  const sidebarInset = (sidebarOpen as boolean)
    ? Math.min(320, typeof window === "undefined" ? 320 : window.innerWidth * 0.85)
    : 0

  let pageStackIndex = 0

  return (
    <>
      <div
        aria-hidden={false}
        className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
        data-comments-overlay=""
      >
        {roots.map((comment, index) => {
          const anchored = positions.has(comment.id)
          const point = anchored
            ? positions.get(comment.id)!
            : pageStackPoint(pageStackIndex++)
          const own = session?.id === comment.session_id
          const resolved = comment.resolved_at !== null
          const label = String(index + 1)
          const draggable = own && anchored && comment.anchor !== null
          return (
            <CommentPin
              key={comment.id}
              ref={(node) => {
                if (node) pinRefs.current.set(comment.id, node)
                else pinRefs.current.delete(comment.id)
              }}
              x={point.x}
              y={point.y}
              color={comment.author_color}
              label={label}
              own={own}
              open={openThreadId === comment.id}
              resolved={resolved}
              subtle={!anchored}
              lifted={drag?.id === comment.id}
              settling={settlingId === comment.id}
              flashing={flashedId === comment.id}
              title={draggable ? t("comments-drag-hint-label") : undefined}
              ariaLabel={t(
                resolved ? "comments-resolved-pin-aria-label" : "comments-pin-aria-label",
                { number: label, name: comment.author_name },
              )}
              onPointerDown={draggable ? handlersFor(comment.id).onPointerDown : undefined}
              onPointerEnter={() => schedulePreview(comment.id)}
              onPointerLeave={clearPreview}
              onFocus={() => {
                revealPin(comment)
                schedulePreview(comment.id)
              }}
              onBlur={clearPreview}
              onClick={() => {
                if (consumeSuppressedClick()) return
                openThread(comment)
              }}
            />
          )
        })}

        {drag ? (
          <CommentPin
            x={drag.point.x}
            y={drag.point.y}
            color={dragColor(roots, drag.id, session?.color ?? DRAFT_COLOR)}
            label={dragLabel(roots, drag.id)}
            ariaLabel={t("comments-move-label")}
            own
            dragging
            invalid={!drag.valid}
          />
        ) : null}

        {draft && draftPoint ? (
          <CommentPin
            x={draftPoint.x}
            y={draftPoint.y}
            color={session?.color ?? DRAFT_COLOR}
            label="+"
            ariaLabel={t("comments-body-placeholder")}
            own
            draft
            open
          />
        ) : null}

        {previewComment && previewPoint ? (
          <CommentPreview
            comment={previewComment}
            replyCount={repliesOf(comments, previewComment.id).length}
            point={previewPoint}
          />
        ) : null}
      </div>

      {draft && draftPoint && sectionId ? (
        <PointPopover
          point={draftPoint}
          open
          onClose={closeDraft}
          ariaLabel={t("comments-body-placeholder")}
          trapFocus
          finalFocus={originRef}
          rightInset={sidebarInset}
        >
          <CommentForm
            context={context}
            pageSectionId={sectionId}
            anchor={draft.anchor}
            autoFocus
            onPosted={onRootPosted}
            onCancel={closeDraft}
          />
        </PointPopover>
      ) : null}

      {openRoot && openRootPoint ? (
        <PointPopover
          point={openRootPoint}
          open
          onClose={closeThread}
          ariaLabel={`${t("comments-thread-label")} — ${openRoot.author_name}`}
          focusSurfaceOnOpen
          rightInset={sidebarInset}
        >
          <CommentThread
            context={context}
            root={openRoot}
            comments={comments}
            anchored={positions.has(openRoot.id)}
            actions={actions}
            onRequestMove={(comment) => {
              setOpenThreadId(null)
              setMovingId(comment.id)
            }}
            onPosted={async () => {
              await refresh()
              announceToScreenReader(t("comments-reply-posted-label"))
            }}
          />
        </PointPopover>
      ) : null}

      <CommentsSidebar
        open={sidebarOpen as boolean}
        roots={roots}
        comments={comments}
        anchoredIds={anchoredIds}
        openThreadId={openThreadId}
        onSelect={selectFromSidebar}
        onClose={() => {
          setSidebarOpen(false)
          document.querySelector<HTMLElement>("[data-comments-list-trigger]")?.focus()
        }}
      />
    </>
  )
}

function dragColor(roots: PublishComment[], id: string, fallback: string): string {
  return roots.find((comment) => comment.id === id)?.author_color ?? fallback
}

function dragLabel(roots: PublishComment[], id: string): string {
  const index = roots.findIndex((comment) => comment.id === id)
  return index === -1 ? "+" : String(index + 1)
}

function pageStackPoint(index: number): { x: number; y: number } {
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth
  return {
    x: viewportWidth - PAGE_STACK_RIGHT,
    y: PAGE_STACK_TOP + index * PAGE_STACK_STEP + 28,
  }
}

function pointFor(
  comment: PublishComment,
  roots: PublishComment[],
  positions: Map<string, { x: number; y: number }>,
): { x: number; y: number } {
  const anchored = positions.get(comment.id)
  if (anchored) return anchored
  const stackIndex = roots
    .filter((candidate) => !positions.has(candidate.id))
    .findIndex((candidate) => candidate.id === comment.id)
  return pageStackPoint(Math.max(0, stackIndex))
}
