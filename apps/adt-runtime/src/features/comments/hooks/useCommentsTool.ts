import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { MessageSquare } from "lucide-react"
import { useMemo } from "react"
import type { DockTool } from "@/features/dock/components/DockMobileTools"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import {
  commentDraftAtom,
  commentModeAtom,
  commentsWritableAtom,
  pageCommentCountAtom,
} from "@/features/comments/state/comments.atoms"

/**
 * The mobile dock's tool sheet takes descriptors rather than components, so the
 * comments entry is described here and stays `null` — invisible and free — on
 * anything that is not a published share link.
 */
export function useCommentsTool(): DockTool | null {
  const context = useCommentsContext()
  const { t } = useCommentsText()
  const [mode, setMode] = useAtom(commentModeAtom)
  const writable = useAtomValue(commentsWritableAtom)
  const count = useAtomValue(pageCommentCountAtom)
  const setDraft = useSetAtom(commentDraftAtom)

  const active = writable && (mode as boolean)

  return useMemo(() => {
    if (!context || !writable) return null
    const label = active ? t("comments-mode-exit-label") : t("comments-mode-label")
    return {
      key: "comments",
      label: count > 0 ? `${label} (${count})` : label,
      icon: MessageSquare,
      active,
      onSelect: () => {
        setMode((previous) => !previous)
        setDraft(null)
      },
    }
  }, [active, context, count, setDraft, setMode, t, writable])
}
