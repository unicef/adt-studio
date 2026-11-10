import { useSyncExternalStore } from "react"

export type AiView = "closed" | "intro" | "live" | "pill"

export interface AiRun {
  keys: string[]
  done: string[]
  active: string[]
  pageId: string | null
  stopping: boolean
  finished: boolean
  error: string | null
}

export interface AiRunState {
  view: AiView
  run: AiRun | null
}

const EMPTY: AiRunState = { view: "closed", run: null }
const states = new Map<string, AiRunState>()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readAiRun(label: string): AiRunState {
  return states.get(label) ?? EMPTY
}

export function updateAiRun(label: string, change: (previous: AiRunState) => AiRunState) {
  states.set(label, change(readAiRun(label)))
  emit()
}

export function patchRun(label: string, change: (run: AiRun) => AiRun) {
  updateAiRun(label, (previous) => (previous.run ? { ...previous, run: change(previous.run) } : previous))
}

export function useAiRun(label: string): AiRunState {
  return useSyncExternalStore(
    subscribe,
    () => readAiRun(label),
    () => EMPTY,
  )
}
