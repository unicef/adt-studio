import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import { isTypingTarget } from "@/features/navigation/lib/typing-target"
import { buildAnchor, contentRoot } from "@/features/comments/lib/anchor"
import {
  commentDraftAtom,
  commentModeAtom,
  commentsWritableAtom,
  openThreadIdAtom,
} from "@/features/comments/state/comments.atoms"

const MODE_ATTRIBUTE = "data-comment-mode"

/**
 * Comment mode: the pin cursor, the click-to-drop-a-pin handler and the `C`
 * shortcut.
 *
 * Clicks inside `#content` are taken in the capture phase and cancelled, so a
 * link, a quiz option or a glossary term cannot fire while the reviewer is
 * placing a pin — in Figma the canvas stops being interactive in comment mode,
 * and a reviewer who lands on the next page instead of a composer loses their
 * thought.
 */
export function useCommentMode(enabled: boolean): void {
  const [mode, setMode] = useAtom(commentModeAtom)
  const writable = useAtomValue(commentsWritableAtom)
  const setDraft = useSetAtom(commentDraftAtom)
  const setOpenThread = useSetAtom(openThreadIdAtom)

  const active = enabled && writable && (mode as boolean)

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      if (event.key !== "c" && event.key !== "C") return
      event.preventDefault()
      setMode((previous) => !previous)
      setDraft(null)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [enabled, setMode, setDraft])

  useEffect(() => {
    if (!active) return
    document.body.setAttribute(MODE_ATTRIBUTE, "on")
    return () => document.body.removeAttribute(MODE_ATTRIBUTE)
  }, [active])

  useEffect(() => {
    if (!active) return

    const suppress = (event: MouseEvent) => {
      const target = event.target as Element | null
      const root = contentRoot()
      if (!target || !root || !root.contains(target)) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const root = contentRoot()
      if (!target || !root || !root.contains(target)) return
      event.preventDefault()
      event.stopPropagation()
      const anchor = buildAnchor(target, event.clientX, event.clientY, { root })
      setOpenThread(null)
      setDraft({ anchor, x: event.clientX, y: event.clientY })
    }

    document.addEventListener("mousedown", suppress, true)
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("mousedown", suppress, true)
      document.removeEventListener("click", onClick, true)
    }
  }, [active, setDraft, setOpenThread])
}
