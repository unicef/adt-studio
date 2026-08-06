import { useAtomValue, useSetAtom } from "jotai"
import { Eye } from "lucide-react"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import {
  followSentToAtom,
  followedNameAtom,
} from "@/features/comments/state/follow.atoms"

/**
 * The one piece of chrome a follow must never do without: being moved between pages by
 * somebody else is alarming unless the screen says who, and offers the way out in the same
 * breath. Sits where the comment-mode hint sits, for the same reason — it is the same kind of
 * "you are in a mode" statement.
 */
export function FollowingBanner() {
  const { t } = useCommentsText()
  const name = useAtomValue(followedNameAtom)
  const setName = useSetAtom(followedNameAtom)
  const setSentTo = useSetAtom(followSentToAtom)

  if (name === null) return null

  return (
    <div
      role="status"
      className="fixed bottom-[calc(var(--dock-height,5rem)+1rem)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-popover/95 px-3.5 py-1.5 text-xs shadow-md ring-1 ring-border backdrop-blur-md duration-200 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <Eye className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span className="font-medium text-popover-foreground">
        {t("comments-following-banner-label", { name })}
      </span>
      <span aria-hidden className="text-popover-foreground/40">
        ·
      </span>
      <span className="font-normal text-popover-foreground/75">
        {t("comments-following-hint-label")}
      </span>
      <button
        type="button"
        onClick={() => {
          setName(null)
          setSentTo(null)
        }}
        className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-foreground transition-colors hover:bg-muted/70"
      >
        {t("comments-follow-stop-label")}
      </button>
    </div>
  )
}
