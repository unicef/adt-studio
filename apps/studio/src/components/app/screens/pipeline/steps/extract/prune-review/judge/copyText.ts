export function copyText(text: string): boolean {
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  area.style.pointerEvents = "none"
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.body.appendChild(area)
  area.select()
  let copied = false
  try {
    copied = document.execCommand("copy")
  } catch {
    copied = false
  }
  area.remove()
  active?.focus({ preventScroll: true })
  return copied
}
