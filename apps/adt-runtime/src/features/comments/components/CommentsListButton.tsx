import { useAtom, useAtomValue } from "jotai"
import { MessagesSquare } from "lucide-react"
import { DockIconButton } from "@/features/dock/components/DockIconButton"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import {
  commentsHiddenAtom,
  pageCommentCountAtom,
  sidebarOpenAtom,
} from "@/features/comments/state/comments.atoms"

/**
 * The sidebar's own dock button, rather than a long-press on the comment-mode
 * toggle.
 *
 * A long-press has no keyboard equivalent and nothing tells you it is there,
 * and this panel is the keyboard path to every thread on the page — hiding it
 * behind a gesture would put the accessible route behind the least accessible
 * affordance in the app.
 *
 * It used to appear only once *this page* had something to list, which stopped
 * being right when the panel gained a whole-book scope: a page with no comments
 * of its own was hiding the only way to reach the comments on every other page,
 * and the button appearing and vanishing as you turned pages made the dock feel
 * unreliable. It is now there whenever comments are, and goes only when the
 * reader switches comments off — at which point the mode button is the way back.
 */
export function CommentsListButton() {
  const context = useCommentsContext()
  const { t } = useCommentsText()
  const [open, setOpen] = useAtom(sidebarOpenAtom)
  const count = useAtomValue(pageCommentCountAtom)
  const hidden = useAtomValue(commentsHiddenAtom) as boolean

  if (!context) return null
  /** Comments switched off takes the sidebar with it, or the dock would offer a list of
   *  something the reader has just asked not to see. */
  if (hidden) return null

  const label = (open as boolean) ? t("comments-list-close-label") : t("comments-list-open-label")

  return (
    <DockIconButton
      ariaLabel={
        count > 0 ? `${label} — ${t("comments-count-label", { count: String(count) })}` : label
      }
      tooltip={t("comments-list-label")}
      pressed={open as boolean}
      data-comments-list-trigger=""
      onClick={() => setOpen((previous) => !previous)}
    >
      <MessagesSquare />
    </DockIconButton>
  )
}
