import { Check } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { readableTextColor } from "@/features/comments/lib/color"
import { snippet } from "@/features/comments/lib/summary"
import type { PublishComment } from "@/features/comments/lib/contract"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"

/** Clears the 28px pin plus its ring. */
const OFFSET_X = 22

const OFFSET_Y = 6

const CARD_WIDTH = 232

export interface CommentPreviewProps {
  comment: PublishComment
  replyCount: number
  point: { x: number; y: number }
}

/**
 * What a pin says before you commit to opening it: who, roughly what, and
 * whether there is a conversation behind it.
 *
 * `aria-hidden`, deliberately. It carries nothing the pin's own label and the
 * sidebar do not already say, and a card that appears on hover after a delay is
 * noise to a screen reader — the keyboard path to the same content is the
 * sidebar, where it is real text.
 */
export function CommentPreview({ comment, replyCount, point }: CommentPreviewProps) {
  const { t } = useCommentsText()
  const flipped = point.x + OFFSET_X + CARD_WIDTH > window.innerWidth

  return (
    <div
      aria-hidden
      data-comment-preview=""
      style={{
        left: `${flipped ? point.x - OFFSET_X : point.x + OFFSET_X}px`,
        top: `${point.y - OFFSET_Y}px`,
        width: `${CARD_WIDTH}px`,
      }}
      className={cn(
        "pointer-events-none absolute z-10 -translate-y-full rounded-xl bg-popover/97 p-2.5",
        "text-popover-foreground shadow-lg ring-1 ring-border backdrop-blur-md",
        "duration-150 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none",
        flipped && "-translate-x-full",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          style={{
            backgroundColor: comment.author_color,
            color: readableTextColor(comment.author_color),
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.55rem] font-bold uppercase"
        >
          {Array.from(comment.author_name.trim())[0] ?? "?"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.7rem] font-semibold">
          {comment.author_name}
        </span>
        {comment.resolved_at ? (
          <span className="flex items-center gap-0.5 text-[0.6rem] font-medium text-muted-foreground">
            <Check aria-hidden className="h-3 w-3" />
            {t("comments-resolved-label")}
          </span>
        ) : null}
      </div>

      <p className="mt-1 line-clamp-2 text-xs leading-snug text-foreground/85">
        {snippet(comment.body, 110)}
      </p>

      {replyCount > 0 ? (
        <p className="mt-1 text-[0.65rem] font-medium text-muted-foreground">
          {replyCount === 1
            ? t("comments-one-reply-label")
            : t("comments-replies-label", { count: String(replyCount) })}
        </p>
      ) : null}
    </div>
  )
}
