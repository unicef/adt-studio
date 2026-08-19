import { useEffect, type RefObject } from "react"

interface FocusSearchShortcutOptions {
  enabled?: boolean
}

export function useFocusSearchShortcut(
  inputRef: RefObject<HTMLInputElement | null>,
  { enabled = true }: FocusSearchShortcutOptions = {},
) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.isComposing || event.keyCode === 229) return

      const target =
        (event.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null)
      if (target) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        if (target.isContentEditable) return
        if (target.getAttribute("role") === "textbox") return
      }

      if (document.querySelector('[role="dialog"][data-state="open"]')) return

      const input = inputRef.current
      if (!input) return

      event.preventDefault()
      input.focus()
      if (input.value.length > 0) input.select()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled, inputRef])
}
