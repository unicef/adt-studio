import { useAtomValue } from "jotai"
import { Check } from "lucide-react"
import { repliesOf, type PublishComment } from "@/features/comments/lib/contract"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import type { CommentActions } from "@/features/comments/hooks/useCommentActions"
import {
  commentsSessionAtom,
  commentsWritableAtom,
} from "@/features/comments/state/comments.atoms"
import { CommentEntry } from "@/features/comments/components/CommentEntry"
import { CommentForm } from "@/features/comments/components/CommentForm"

export interface CommentThreadProps {
  context: CommentsRuntimeContext
  root: PublishComment
  comments: PublishComment[]
  anchored: boolean
  actions: CommentActions
  onPosted: (comment: PublishComment) => void
  /** Hands the keyboard move flow back to the overlay, which owns the walker. */
  onRequestMove?: (comment: PublishComment) => void
}

export function CommentThread({
  context,
  root,
  comments,
  anchored,
  actions,
  onPosted,
  onRequestMove,
}: CommentThreadProps) {
  const { t } = useCommentsText()
  const session = useAtomValue(commentsSessionAtom)
  const writable = useAtomValue(commentsWritableAtom) as boolean
  const replies = repliesOf(comments, root.id)
  const resolved = root.resolved_at !== null

  const manageable = (comment: PublishComment) =>
    writable && session !== null && session.id === comment.session_id

  return (
    <div className="flex flex-col gap-3">
      {resolved ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-2">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <Check aria-hidden className="h-3.5 w-3.5" />
            {t("comments-resolved-label")}
          </p>
          <p className="text-[0.7rem] leading-snug text-muted-foreground">
            {t("comments-resolved-hint-label")}
          </p>
        </div>
      ) : null}

      {anchored ? null : (
        <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
          {t("comments-unanchored-label")}
        </p>
      )}

      <div className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-0.5">
        <CommentEntry
          comment={root}
          isSelf={session?.id === root.session_id}
          manageable={manageable(root)}
          replyCount={replies.length}
          onMove={anchored && onRequestMove ? () => onRequestMove(root) : undefined}
          onEdit={(body) => actions.edit(root.id, body)}
          onDelete={() => actions.remove(root)}
        />
        {replies.map((reply) => (
          <CommentEntry
            key={reply.id}
            comment={reply}
            isSelf={session?.id === reply.session_id}
            manageable={manageable(reply)}
            indented
            onEdit={(body) => actions.edit(reply.id, body)}
            onDelete={() => actions.remove(reply)}
          />
        ))}
      </div>

      {writable ? (
        <div className="border-t border-border pt-2">
          <CommentForm
            context={context}
            pageSectionId={root.page_section_id}
            parentId={root.id}
            compact
            onPosted={onPosted}
          />
        </div>
      ) : null}
    </div>
  )
}
