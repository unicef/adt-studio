import { useAtomValue } from "jotai"
import { cn } from "@/shared/lib/utils"
import { readableTextColor } from "@/features/comments/lib/color"
import { relativeTime } from "@/features/comments/lib/relative-time"
import { repliesOf, type PublishComment } from "@/features/comments/lib/contract"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import { commentsSessionAtom } from "@/features/comments/state/comments.atoms"
import { CommentForm } from "@/features/comments/components/CommentForm"

export interface CommentThreadProps {
  context: CommentsRuntimeContext
  root: PublishComment
  comments: PublishComment[]
  anchored: boolean
  onPosted: (comment: PublishComment) => void
}

export function CommentThread({
  context,
  root,
  comments,
  anchored,
  onPosted,
}: CommentThreadProps) {
  const { t } = useCommentsText()
  const session = useAtomValue(commentsSessionAtom)
  const replies = repliesOf(comments, root.id)

  return (
    <div className="flex flex-col gap-3">
      {anchored ? null : (
        <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
          {t("comments-unanchored-label")}
        </p>
      )}

      <div className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-0.5">
        <CommentEntry comment={root} isSelf={session?.id === root.session_id} />
        {replies.map((reply) => (
          <CommentEntry
            key={reply.id}
            comment={reply}
            isSelf={session?.id === reply.session_id}
            indented
          />
        ))}
      </div>

      <div className="border-t border-border pt-2">
        <CommentForm
          context={context}
          pageSectionId={root.page_section_id}
          parentId={root.id}
          compact
          onPosted={onPosted}
        />
      </div>
    </div>
  )
}

function CommentEntry({
  comment,
  isSelf,
  indented = false,
}: {
  comment: PublishComment
  isSelf: boolean
  indented?: boolean
}) {
  const { t } = useCommentsText()
  return (
    <div className={cn("flex gap-2", indented && "pl-4")}>
      <span
        aria-hidden
        style={{
          backgroundColor: comment.author_color,
          color: readableTextColor(comment.author_color),
        }}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold uppercase"
      >
        {initialOf(comment.author_name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-xs font-semibold text-foreground">{comment.author_name}</span>
          {isSelf ? (
            <span className="text-[0.65rem] text-muted-foreground">
              ({t("comments-you-label")})
            </span>
          ) : null}
          <span className="text-[0.65rem] text-muted-foreground">
            {relativeTime(comment.created_at, t)}
          </span>
          {comment.edited_at ? (
            <span className="text-[0.65rem] italic text-muted-foreground">
              {t("comments-edited-label")}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm leading-snug whitespace-pre-wrap break-words text-foreground/90">
          {comment.body}
        </p>
      </div>
    </div>
  )
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "?"
}
