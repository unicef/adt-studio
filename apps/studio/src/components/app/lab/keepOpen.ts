export function keepOpenForLab(event: { target: EventTarget | null; preventDefault: () => void }) {
  const target = event.target
  if (target instanceof Element && target.closest("[data-lab-toolbar]")) event.preventDefault()
}
