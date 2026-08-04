import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useMemo } from "react"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import { rootComments, type PublishComment } from "@/features/comments/lib/contract"
import { useAnchorPositions, type AnchorTarget } from "@/features/comments/hooks/useAnchorPositions"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import {
  commentDraftAtom,
  commentModeAtom,
  commentsAtom,
  commentsSessionAtom,
  openThreadIdAtom,
} from "@/features/comments/state/comments.atoms"
import { CommentForm } from "@/features/comments/components/CommentForm"
import { CommentPin } from "@/features/comments/components/CommentPin"
import { CommentThread } from "@/features/comments/components/CommentThread"
import { PointPopover } from "@/features/comments/components/PointPopover"

const DRAFT_COLOR = "#0091ff"

/** Page-level threads (never anchored, or anchored to markup that no longer
 *  resolves) stack in the corner instead of vanishing. The full sidebar is the
 *  proper home for them. */
const PAGE_STACK_TOP = 24

const PAGE_STACK_RIGHT = 24

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
  const setCommentMode = useSetAtom(commentModeAtom)

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

  const closeDraft = useCallback(() => setDraft(null), [setDraft])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (draft) {
        setDraft(null)
        return
      }
      if (openThreadId) setOpenThreadId(null)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [draft, openThreadId, setDraft, setOpenThreadId])

  const onRootPosted = useCallback(
    async (comment: PublishComment) => {
      setDraft(null)
      setCommentMode(false)
      await refresh()
      setOpenThreadId(comment.id)
    },
    [refresh, setCommentMode, setDraft, setOpenThreadId],
  )

  const openRoot = openThreadId
    ? (roots.find((comment) => comment.id === openThreadId) ?? null)
    : null

  const openRootPoint = openRoot ? pointFor(openRoot, roots, positions) : null

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
          return (
            <CommentPin
              key={comment.id}
              x={point.x}
              y={point.y}
              color={comment.author_color}
              label={String(index + 1)}
              own={session?.id === comment.session_id}
              open={openThreadId === comment.id}
              ariaLabel={t("comments-pin-aria-label", {
                number: String(index + 1),
                name: comment.author_name,
              })}
              onClick={() => {
                setDraft(null)
                setOpenThreadId((current) => (current === comment.id ? null : comment.id))
              }}
            />
          )
        })}

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
      </div>

      {draft && draftPoint && sectionId ? (
        <PointPopover
          point={draftPoint}
          open
          onClose={closeDraft}
          ariaLabel={t("comments-body-placeholder")}
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
          onClose={() => setOpenThreadId(null)}
          ariaLabel={t("comments-thread-label")}
        >
          <CommentThread
            context={context}
            root={openRoot}
            comments={comments}
            anchored={positions.has(openRoot.id)}
            onPosted={() => void refresh()}
          />
        </PointPopover>
      ) : null}
    </>
  )
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
