import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import { commentModeAtom, rememberedNameAtom } from "@/features/comments/state/comments.atoms"
import { useCommentMode } from "@/features/comments/hooks/useCommentMode"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsData } from "@/features/comments/hooks/useCommentsData"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { CommentsOverlay } from "@/features/comments/components/CommentsOverlay"
import { NAME_STORAGE_KEY } from "@/features/comments/components/CommentForm"

/**
 * Feature root, mounted from `ChromeRoot`. Everything below it is dead code at
 * runtime unless the book was published *and* is being read through a share
 * link: no fetch, no listeners, no DOM.
 */
export function Comments() {
  const context = useCommentsContext()
  const { t } = useCommentsText()
  const mode = useAtomValue(commentModeAtom) as boolean
  const setRememberedName = useSetAtom(rememberedNameAtom)

  useCommentMode(context !== null)
  const { refresh } = useCommentsData(context)

  useEffect(() => {
    if (!context) return
    try {
      const stored = window.localStorage.getItem(NAME_STORAGE_KEY)
      if (stored) setRememberedName(stored)
    } catch {
      /* private-mode storage refusal must not block commenting */
    }
  }, [context, setRememberedName])

  if (!context) return null

  return (
    <>
      <CommentsOverlay context={context} refresh={refresh} />
      {mode ? (
        <p
          role="status"
          className="pointer-events-none fixed bottom-[calc(var(--dock-height,5rem)+1rem)] left-1/2 z-40 -translate-x-1/2 rounded-full bg-popover/95 px-3.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md ring-1 ring-border backdrop-blur-md duration-200 animate-in fade-in-0 slide-in-from-bottom-2"
        >
          {t("comments-mode-hint")}
        </p>
      ) : null}
    </>
  )
}
