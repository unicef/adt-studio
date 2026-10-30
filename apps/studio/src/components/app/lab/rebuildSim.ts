import { useSyncExternalStore } from "react"
import { LAB_ENABLED, useVariant } from "./variants"

const SIM_REBUILD_MS = 3500

interface RebuildSimState {
  rebuilding: ReadonlySet<string>
  rebuilt: ReadonlySet<string>
}

let state: RebuildSimState = { rebuilding: new Set(), rebuilt: new Set() }
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function update(next: RebuildSimState) {
  state = next
  for (const listener of listeners) listener()
}

function rebuild(pageIds: string[]) {
  update({ ...state, rebuilding: new Set([...state.rebuilding, ...pageIds]) })
  setTimeout(() => {
    const rebuilding = new Set(state.rebuilding)
    for (const id of pageIds) rebuilding.delete(id)
    update({ rebuilding, rebuilt: new Set([...state.rebuilt, ...pageIds]) })
  }, SIM_REBUILD_MS)
}

export interface LabRebuildSim extends RebuildSimState {
  rebuild: (pageIds: string[]) => void
}

export function useLabRebuildSim(label: string | null): LabRebuildSim | null {
  const sbsim = useVariant("sbsim")
  const snapshot = useSyncExternalStore(subscribe, () => state)
  const active = LAB_ENABLED && !!label?.startsWith("lab-") && sbsim === "outdated"
  return active ? { ...snapshot, rebuild } : null
}
