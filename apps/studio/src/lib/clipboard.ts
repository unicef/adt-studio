/**
 * Copy text, also when Studio is opened over plain http from another machine
 * (a LAN or Tailscale address, a Docker host). Browsers expose
 * `navigator.clipboard` only on https and localhost, so when it is missing or
 * fails the copy falls back to a hidden textarea and `document.execCommand("copy")`, which still
 * works inside the click that triggered it. Rejects when neither path copies.
 */
export async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Unfocused window or a denied permission: the fallback below may still work.
    }
  }
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "0"
  textarea.style.opacity = "0"
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand("copy")
  } finally {
    textarea.remove()
    active?.focus()
  }
  if (!copied) throw new Error("Copy failed")
}
