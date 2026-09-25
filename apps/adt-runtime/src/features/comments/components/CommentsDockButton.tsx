import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { MessageSquareOff, MessageSquarePlus } from "lucide-react"
import { useRef, useState } from "react"
import { useDockContext } from "@/features/dock/context/dock-context"
import { CommentsHint, hintSeen, markHintSeen } from "@/features/comments/components/CommentsHint"
import { DockIconButton } from "@/features/dock/components/DockIconButton"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import {
  commentDraftAtom,
  commentModeAtom,
  commentsHiddenAtom,
  commentsWritableAtom,
  openThreadIdAtom,
  sidebarOpenAtom,
} from "@/features/comments/state/comments.atoms"

/**
 * Comment mode lives with the reader's other tools in the dock — the same row a
 * reviewer already reaches for, and the only chrome that is guaranteed to be on
 * screen on every page.
 *
 * It is the *writing* tool, so it wears a bubble with a plus, and the count of what is already
 * on the page belongs to the list button beside it — the one that reads them. Both used to be
 * speech bubbles with the badge on this one, which made "leave a comment" and "read the
 * comments" the same icon twice.
 */
export function CommentsDockButton() {
  const context = useCommentsContext()
  const { t } = useCommentsText()
  const [mode, setMode] = useAtom(commentModeAtom)
  const writable = useAtomValue(commentsWritableAtom)
  const setDraft = useSetAtom(commentDraftAtom)
  const [hidden, setHidden] = useAtom(commentsHiddenAtom)
  const [hintOpen, setHintOpen] = useState(() => (context ? !hintSeen(context.apiBase) : false))
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const { popoverSide } = useDockContext()
  /** Not over the comments it is inviting the reader to add to: an open list or thread means
   *  the reader has already found them. */
  const sidebarOpen = useAtomValue(sidebarOpenAtom) as boolean
  const openThread = useAtomValue(openThreadIdAtom)

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
  const ariaLabel = label
  const showHint = hintOpen && writable && !active && !sidebarOpen && openThread === null

  return (
    <>
    {showHint ? (
      <CommentsHint
        apiBase={context.apiBase}
        anchor={buttonRef}
        side={popoverSide === "bottom" ? "bottom" : "top"}
        onDismiss={() => setHintOpen(false)}
      />
    ) : null}
    <DockIconButton
      ref={buttonRef}
      ariaLabel={ariaLabel}
      tooltip={label}
      pressed={active}
      disabled={!writable}
      className="relative"
      onClick={() => {
        setMode((previous) => !previous)
        setDraft(null)
        /** Using the tool is the answer the hint was asking for. */
        if (hintOpen) {
          markHintSeen(context.apiBase)
          setHintOpen(false)
        }
      }}
    >
      <MessageSquarePlus />
    </DockIconButton>
    </>
  )
}
