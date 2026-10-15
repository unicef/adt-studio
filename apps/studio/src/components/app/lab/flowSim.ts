import { createPersistentStore } from "@/hooks/create-persistent-store"

export interface FlowSim {
  content: "final" | "running" | "failed"
  changed: "none" | "terms"
}

const store = createPersistentStore<FlowSim>(
  "adt.lab.flow-sim",
  { content: "final", changed: "none" },
  (value): value is FlowSim => typeof value === "object" && value !== null && "content" in value && "changed" in value,
)

export const useFlowSim = store.use
export const getFlowSim = store.get
export const setFlowSim = store.set
