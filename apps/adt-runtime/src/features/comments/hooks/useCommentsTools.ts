import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { MessageSquare, MessagesSquare } from "lucide-react"
import { useMemo } from "react"
import type { DockTool } from "@/features/dock/components/DockMobileTools"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import {
  commentDraftAtom,
  commentModeAtom,
  commentsWritableAtom,
  pageCommentCountAtom,
  sidebarOpenAtom,
} from "@/features/comments/state/comments.atoms"

/**
 * The mobile dock's tool sheet takes descriptors rather than components, so the
 * comments entries are described here and stay empty — invisible and free — on
 * anything that is not a published share link.
 *
 * Two entries, matching the desktop dock: the mode toggle, and the page's
 * comment list. On a phone the list is the *main* way to read feedback, since a
 * 28px pin on a 390px-wide page is a small target and the thread popover covers
 * much of the content it is about.
 */
export function useCommentsTools(): DockTool[] {
  const context = useCommentsContext()
  const { t } = useCommentsText()
  const [mode, setMode] = useAtom(commentModeAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)
  const writable = useAtomValue(commentsWritableAtom)
  const count = useAtomValue(pageCommentCountAtom)
  const setDraft = useSetAtom(commentDraftAtom)

  const active = writable && (mode as boolean)

  return useMemo(() => {
    if (!context) return []
    const modeLabel = active ? t("comments-mode-exit-label") : t("comments-mode-label")
    const tools: DockTool[] = []

    if (writable) {
      tools.push({
        key: "comments",
        label: count > 0 ? `${modeLabel} (${count})` : modeLabel,
        icon: MessageSquare,
        active,
        onSelect: () => {
          setMode((previous) => !previous)
          setDraft(null)
        },
      })
    }

    if (count > 0 || (sidebarOpen as boolean)) {
      tools.push({
        key: "comments-list",
        label: t("comments-list-label"),
        icon: MessagesSquare,
        active: sidebarOpen as boolean,
        onSelect: () => setSidebarOpen((previous) => !previous),
      })
    }

    return tools
  }, [active, context, count, setDraft, setMode, setSidebarOpen, sidebarOpen, t, writable])
}
