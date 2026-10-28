import { getDefaultStore } from "jotai"
import { activityStore, bindActivityScope, beginActivityBatch } from "./activity-scope"
import { rememberActivityChoices } from "./activity-choice-state"
import { initializeQuizActivity } from "./activity-quiz"
import { initializeMultiSelectActivity } from "./activity-multi-select"
import { initializeFillInTheBlankActivity } from "./activity-fill-in-the-blank"
import { initializeOpenEndedActivity } from "./activity-open-ended"
import { initializeTrueFalseActivity } from "./activity-true-false"
import { initializeUnderlineTextActivity } from "./activity-underline-text"
import { initializeMatchingActivity } from "./activity-matching"
import { initializeSortingActivity } from "./activity-sorting"
import { initializeOrderingActivity } from "./activity-ordering"
import { translationsAtom } from "../../language/state/language.atoms"
import { pagesAtom, currentSectionIdAtom } from "../../navigation/state/nav.atoms"
import { navigateToPage } from "../../navigation/lib/page-swap"
import { skipEnabledAtom, skipHandlerAtom, submitEnabledAtom, submitLabelAtom, submitStateAtom, submitVisibleAtom, validateHandlerAtom } from "../state/activity.atoms"

const initializers = [initializeQuizActivity, initializeMultiSelectActivity,
  initializeFillInTheBlankActivity, initializeOpenEndedActivity, initializeTrueFalseActivity,
  initializeUnderlineTextActivity, initializeMatchingActivity, initializeSortingActivity, initializeOrderingActivity]

/** Only the page coordinator submits or advances a composed page. */
export function initializeActivityPage(): (() => void) | null {
  const page = document.querySelector<HTMLElement>("[data-experimental-activity-page]")
  if (!page) return null
  const shared = getDefaultStore()
  const scoped = page.dataset.experimentalActivityPage === "section"
  const cleanups: Array<() => void> = []
  const blocks = Array.from(page.querySelectorAll<HTMLElement>("[data-activity-block]"))
    .filter(root => root.querySelector('section[data-section-type^="activity_"]'))
  const controllers = blocks.map(root => {
    cleanups.push(bindActivityScope(root))
    const store = activityStore(root)
    for (const init of initializers) {
      const dispose = init(root)
      if (dispose) cleanups.push(dispose)
    }
    cleanups.push(rememberActivityChoices(root))
    return { root, store }
  })
  let disposed = false
  let pending = false
  let active = 0
  let revision = 0
  let checked = false
  let failed = false
  let endBatch: (() => void) | undefined
  const status = document.createElement("p")
  status.setAttribute("role", "status")
  status.setAttribute("tabindex", "-1")
  status.className = "mx-auto w-full max-w-3xl rounded-lg bg-blue-50 p-4 font-semibold"
  page.prepend(status)
  const tr = (key: string, fallback: string) => shared.get(translationsAtom)[key] || fallback
  const completed = (c: typeof controllers[number]) => c.store.get(submitStateAtom) === "next"
  const allDone = () => controllers.length > 0 && controllers.every(completed)
  const nextHref = () => {
    const pages = shared.get(pagesAtom)
    const index = pages.findIndex(p => p.section_id === shared.get(currentSectionIdAtom))
    return index >= 0 ? pages[index + 1]?.href : undefined
  }
  function refresh() {
    if (disposed) return
    const done = allDone()
    const currentDone = scoped && controllers[active] && completed(controllers[active])
    shared.set(submitStateAtom, done || currentDone ? "next" : "submit")
    shared.set(submitLabelAtom, pending ? tr("activity-page-checking", "Checking…") :
      done ? (nextHref() ? tr("next", "Next") : tr("activity-page-complete", "Page complete")) :
      currentDone ? tr("activity-page-next-section", "Next section") :
      scoped ? tr("activity-page-check-section", "Check section") : tr("activity-page-check-page", "Check page"))
    shared.set(submitVisibleAtom, true)
    shared.set(submitEnabledAtom, !pending && controllers.length > 0 && (!done || !!nextHref()))
    // The experiment requires an explicit check of every activity before advancing.
    shared.set(skipEnabledAtom, false)
    shared.set(skipHandlerAtom, () => null)
    status.textContent = failed ? tr("activity-page-error", "This section could not be checked. Try again.") : pending ? tr("activity-page-checking", "Checking…") :
      done ? tr("activity-page-complete", "Page complete") :
      tr("activity-page-progress", "${done} of ${total} sections complete")
        .replace("${done}", String(controllers.filter(completed).length)).replace("${total}", String(controllers.length))
    for (const [index, c] of controllers.entries()) {
      c.root.style.outline = scoped && index === active ? "2px solid #2563eb" : ""
      c.root.style.outlineOffset = scoped && index === active ? "4px" : ""
    }
  }
  function focusBlock(index: number) {
    const root = controllers[index]?.root
    const control = root?.querySelector<HTMLElement>('[aria-invalid="true"], input:not([type="hidden"]), textarea, [role="radio"], [role="checkbox"], button')
    if (control) control.focus()
    else { root?.setAttribute("tabindex", "-1"); root?.focus() }
  }
  async function submit() {
    if (disposed || pending) return
    if (allDone()) { const href = nextHref(); if (href) navigateToPage(href); return }
    if (scoped && completed(controllers[active])) {
      active = controllers.findIndex(c => !completed(c))
      refresh(); focusBlock(active); return
    }
    const targets = scoped ? [controllers[active]] : controllers
    const submittedRevision = revision
    pending = true
    failed = false
    checked = true
    refresh()
    endBatch = beginActivityBatch()
    try {
      // Sequential checks preserve deterministic feedback/focus ordering and
      // allow the async open-response validator to settle before completion.
      for (const c of targets) {
        if (disposed || revision !== submittedRevision) return
        if (!completed(c)) {
          const validate = c.store.get(validateHandlerAtom)
          if (!validate) throw new Error("Activity controller unavailable")
          await validate()
        }
      }
    } catch {
      failed = true
      return
    } finally {
      endBatch?.()
      endBatch = undefined
      pending = false
      if (!disposed && revision !== submittedRevision) {
        for (const c of targets) c.store.set(submitStateAtom, "submit")
      }
      if (!disposed) refresh()
    }
    if (!disposed && revision === submittedRevision) {
      const unresolved = targets.find(c => !completed(c))
      if (unresolved) focusBlock(controllers.indexOf(unresolved))
      else status.focus()
    }
  }
  for (const c of controllers) {
    const onEdit = () => {
      revision++
      if (checked && completed(c)) c.store.set(submitStateAtom, "submit")
      refresh()
    }
    c.root.addEventListener("input", onEdit, true)
    c.root.addEventListener("change", onEdit, true)
    cleanups.push(() => { c.root.removeEventListener("input", onEdit, true); c.root.removeEventListener("change", onEdit, true) })
    cleanups.push(c.store.sub(submitStateAtom, refresh))
    // Child controllers own completion only. The shared dock never receives
    // their navigation handlers or their last-page disabled state.
  }
  cleanups.push(shared.sub(translationsAtom, () => {
    revision++
    for (const c of controllers) c.store.set(submitStateAtom, "submit")
    refresh()
  }))
  shared.set(validateHandlerAtom, () => submit)
  refresh()
  return () => {
    disposed = true
    endBatch?.()
    cleanups.reverse().forEach(dispose => dispose())
    status.remove()
    shared.set(validateHandlerAtom, () => null)
    shared.set(submitLabelAtom, null)
    shared.set(submitEnabledAtom, false)
  }
}
