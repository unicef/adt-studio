import { useCallback } from "react"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import type { LeftOutCategory, LeftOutOpinionConfidence, LeftOutOpinionVerdict } from "@/api/client"

export interface Opinion {
  verdict: LeftOutOpinionVerdict
  category: LeftOutCategory
  reasoning: string
  confidence?: LeftOutOpinionConfidence
  modelId: string
  promptVersion?: number
  language?: string
  at: number
}

export type BookOpinions = Record<string, Opinion>

function isRecord<T>(value: unknown): value is Record<string, T> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const opinionStore = createPersistentStore<Record<string, BookOpinions>>("adt.extract.left-out.second-opinion.v2", {}, isRecord)

export function useBookOpinions(label: string): [BookOpinions, (change: (previous: BookOpinions) => BookOpinions) => void] {
  const [all, setAll] = opinionStore.use()
  const update = useCallback(
    (change: (previous: BookOpinions) => BookOpinions) => setAll((previous) => ({ ...previous, [label]: change(previous[label] ?? {}) })),
    [label, setAll],
  )
  return [all[label] ?? {}, update]
}
