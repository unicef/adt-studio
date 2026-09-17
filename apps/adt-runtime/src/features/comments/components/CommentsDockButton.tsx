import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { MessageSquare, MessageSquareOff } from "lucide-react"
import { DockIconButton } from "@/features/dock/components/DockIconButton"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import {
  commentDraftAtom,
  commentModeAtom,
  commentsHiddenAtom,
  commentsWritableAtom,
  pageCommentCountAtom,
} from "@/features/comments/state/comments.atoms"

/**
 * Comment mode lives with the reader's other tools in the dock — the same row a
 * reviewer already reaches for, and the only chrome that is guaranteed to be on
 * screen on every page. The count badge is how a reviewer discovers that
 * feedback already exists on the page they just opened.
 */
export function CommentsDockButton() {
  const context = useCommentsContext()
  const { t } = useCommentsText()
  const [mode, setMode] = useAtom(commentModeAtom)
  const writable = useAtomValue(commentsWritableAtom)
  const count = useAtomValue(pageCommentCountAtom)
  const setDraft = useSetAtom(commentDraftAtom)
  const [hidden, setHidden] = useAtom(commentsHiddenAtom)

  if (!context) return null

  /** With everything hidden there is no pin, no cursor and no roster left on screen, so this
   *  button is the entire way back. It says what it does rather than staying a comment tool
   *  that mysteriously does nothing. */
  if (hidden as boolean) {
    return (
      <DockIconButton
        ariaLabel={t("comments-hidden-show-label")}
        tooltip={t("comments-hidden-show-label")}
        onClick={() => setHidden(false)}
      >
        <MessageSquareOff />
      </DockIconButton>
    )
  }

  const active = writable && (mode as boolean)
  const label = writable
    ? active
      ? t("comments-mode-exit-label")
      : t("comments-mode-label")
    : t("comments-closed-label")
  const ariaLabel =
    count > 0 ? `${label} — ${t("comments-count-label", { count: String(count) })}` : label

  return (
    <DockIconButton
      ariaLabel={ariaLabel}
      tooltip={label}
      pressed={active}
      disabled={!writable}
      className="relative"
      onClick={() => {
        setMode((previous) => !previous)
        setDraft(null)
      }}
    >
      <MessageSquare />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold leading-none text-primary-foreground ring-2 ring-popover duration-200 animate-in zoom-in-50"
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </DockIconButton>
  )
}
