import { useAtom, useAtomValue } from "jotai"
import { MessagesSquare } from "lucide-react"
import { DockIconButton } from "@/features/dock/components/DockIconButton"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import {
  commentModeAtom,
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
 * affordance in the app. It appears only once the page has something to list
 * (or while the reviewer is commenting), so a reader who never comments never
 * sees a second button.
 */
export function CommentsListButton() {
  const context = useCommentsContext()
  const { t } = useCommentsText()
  const [open, setOpen] = useAtom(sidebarOpenAtom)
  const count = useAtomValue(pageCommentCountAtom)
  const mode = useAtomValue(commentModeAtom) as boolean

  if (!context) return null
  if (count === 0 && !mode && !(open as boolean)) return null

  const label = (open as boolean) ? t("comments-list-close-label") : t("comments-list-open-label")

  return (
    <DockIconButton
      ariaLabel={
        count > 0 ? `${label} — ${t("comments-count-label", { count: String(count) })}` : label
      }
      tooltip={t("comments-list-label")}
      pressed={open as boolean}
      className="duration-200 animate-in fade-in-0 zoom-in-90 motion-reduce:animate-none"
      data-comments-list-trigger=""
      onClick={() => setOpen((previous) => !previous)}
    >
      <MessagesSquare />
    </DockIconButton>
  )
}
