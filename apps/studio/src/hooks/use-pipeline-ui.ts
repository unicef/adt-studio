import { useSyncExternalStore } from "react"

export const PIPELINE_UIS = ["new", "classic"] as const

export type PipelineUi = (typeof PIPELINE_UIS)[number]

const STORAGE_KEY = "adt.pipeline-ui"

const DEFAULT_UI: PipelineUi = "new"

function read(): PipelineUi {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return PIPELINE_UIS.includes(raw as PipelineUi) ? (raw as PipelineUi) : DEFAULT_UI
  } catch {
    return DEFAULT_UI
  }
}

let current = read()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return
    current = read()
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPipelineUi(): PipelineUi {
  return current
}

export function setPipelineUi(ui: PipelineUi) {
  current = ui
  try {
    localStorage.setItem(STORAGE_KEY, ui)
  } catch {
    /* ignore */
  }
  emit()
}

export function usePipelineUi() {
  return [useSyncExternalStore(subscribe, getPipelineUi), setPipelineUi] as const
}
