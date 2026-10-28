/** Restore native choice controls through their existing controller events. */
export function rememberActivityChoices(root: HTMLElement): () => void {
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"][data-activity-item], input[type="checkbox"][data-activity-item]'))
  if (!inputs.length) return () => {}
  const key = `adt:activity-choices:${location.pathname.slice(0, location.pathname.lastIndexOf("/"))}:${root.dataset.activityBlock}:${root.dataset.blockAnswers ?? ""}`
  const identity = (input: HTMLInputElement) => JSON.stringify([input.name, input.dataset.activityItem, input.value])
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null")
    if (Array.isArray(saved)) for (const input of inputs) {
      if (saved.includes(identity(input))) {
        input.checked = true
        input.dispatchEvent(new Event("change", { bubbles: true }))
      }
    }
  } catch { /* Restricted storage must not prevent answering. */ }
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(inputs.filter(input => input.checked).map(identity))) } catch { /* Storage is optional. */ }
  }
  root.addEventListener("change", save)
  root.addEventListener("click", save)
  return () => { root.removeEventListener("change", save); root.removeEventListener("click", save) }
}
