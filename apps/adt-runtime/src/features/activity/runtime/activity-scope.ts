import { createStore, getDefaultStore } from "jotai"
import * as activityAtoms from "../state/activity.atoms"

const stores = new WeakMap<Element, ReturnType<typeof createStore>>()
const localAtoms = new Set<unknown>(Object.values(activityAtoms))
let batches = 0
export const isActivityBatch = () => batches > 0
export function beginActivityBatch(): () => void {
  batches++
  let active = true
  return () => { if (active) { active = false; batches-- } }
}

/** Activity state is per block; language/config/navigation remain reader-wide. */
export function bindActivityScope(root: HTMLElement): () => void {
  const local = createStore()
  const shared = getDefaultStore()
  const scoped = {
    get: ((atom) => (localAtoms.has(atom) ? local : shared).get(atom)) as typeof local.get,
    set: ((atom, ...args) => (localAtoms.has(atom) ? local : shared).set(atom, ...args)) as typeof local.set,
    sub: ((atom, listener) => (localAtoms.has(atom) ? local : shared).sub(atom, listener)) as typeof local.sub,
  }
  stores.set(root, scoped)
  return () => { stores.delete(root) }
}

export function activityStore(element: Element): ReturnType<typeof createStore> {
  const root = element.closest("[data-activity-block]")
  return (root && stores.get(root)) || getDefaultStore()
}

function blockMap(element: Element, attribute: string): Record<string, unknown> | undefined {
  const root = element.closest("[data-activity-block]")
  if (!root) return undefined
  try { return JSON.parse(root.getAttribute(attribute) ?? "{}") } catch { return {} }
}

export function activityAnswers(element: Element): Record<string, unknown> {
  return blockMap(element, "data-block-answers") ?? window.correctAnswers ?? {}
}

export function activityAnswerTextId(element: Element, itemId: string): string | undefined {
  const ids = blockMap(element, "data-block-answer-text-ids") ?? window.activityAnswerTextIds ?? {}
  return typeof ids[itemId] === "string" ? ids[itemId] : undefined
}

/** Keep the legacy filename-based response identity when regrouping sections. */
export function activityPersistenceId(element: Element): string {
  return element.closest("[data-activity-block]")?.getAttribute("data-activity-block") ??
    location.pathname.substring(location.pathname.lastIndexOf("/") + 1).split(".")[0]
}

export function activityDomId(element: Element, id: string): string {
  const owner = element.closest("[data-activity-block]")?.getAttribute("data-activity-block")
  return owner ? `${owner}--${id}` : id
}
