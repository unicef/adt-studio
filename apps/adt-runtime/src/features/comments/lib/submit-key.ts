import type { KeyboardEvent } from "react"

/**
 * Enter sends a comment and Shift+Enter starts a new line, as in a chat box. An Enter that
 * confirms an input-method composition (Japanese, Chinese, Korean…) is still typing, not a
 * send — Safari reports that one as key code 229 rather than `isComposing`.
 */
export function isSubmitKey(event: KeyboardEvent<HTMLElement>): boolean {
  if (event.key !== "Enter" || event.shiftKey) return false
  return !event.nativeEvent.isComposing && event.keyCode !== 229
}
