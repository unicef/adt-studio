import { useCallback } from "react"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import type { Tier } from "../tier"

export type Verdict = "right" | "wrong"

export interface Judgement {
  verdict: Verdict | null
  comment: string
  pageNumber: number
  number: number
  width?: number
  height?: number
  reason: string | null
  tier?: Tier | null
  at: number
}

export type BookJudgements = Record<string, Judgement>

function isRecord<T>(value: unknown): value is Record<string, T> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const judgementStore = createPersistentStore<Record<string, BookJudgements>>("adt.extract.left-out.judgements", {}, isRecord)
const modeStore = createPersistentStore<Record<string, boolean>>("adt.extract.left-out.judge-mode", {}, isRecord)

export function useBookJudgements(label: string): [BookJudgements, (change: (previous: BookJudgements) => BookJudgements) => void] {
  const [all, setAll] = judgementStore.use()
  const update = useCallback(
    (change: (previous: BookJudgements) => BookJudgements) =>
      setAll((previous) => {
        const next = change(previous[label] ?? {})
        if (Object.keys(next).length > 0) return { ...previous, [label]: next }
        const rest = { ...previous }
        delete rest[label]
        return rest
      }),
    [label, setAll],
  )
  return [all[label] ?? {}, update]
}

export function useJudgeMode(label: string): [boolean, (value: boolean) => void] {
  const [all, setAll] = modeStore.use()
  const set = useCallback((value: boolean) => setAll((previous) => ({ ...previous, [label]: value })), [label, setAll])
  return [all[label] ?? false, set]
}
