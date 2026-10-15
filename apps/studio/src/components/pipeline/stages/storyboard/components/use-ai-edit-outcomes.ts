import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { useLingui } from "@lingui/react/macro"
import type { TaskInfoResponse } from "@/api/client"
import { aiEditNoticeFor, type AiEditOutcomeNotice } from "../lib/ai-edit-outcome"

export interface AiEditTarget {
  pageId: string
  sectionIndex: number
  instruction: string
}

interface UseAiEditOutcomesOptions {
  tasks: TaskInfoResponse[]
  pageId: string
  sectionIndex: number
  onFailed: (message: string) => void
  setInstruction: Dispatch<SetStateAction<string>>
}

export function useAiEditOutcomes({
  tasks,
  pageId,
  sectionIndex,
  onFailed,
  setInstruction,
}: UseAiEditOutcomesOptions) {
  const { t } = useLingui()
  const [notice, setNotice] = useState<AiEditOutcomeNotice | null>(null)
  const [tracked, setTracked] = useState<ReadonlyMap<string, AiEditTarget>>(() => new Map())
  const location = useRef({ pageId, sectionIndex })

  useEffect(() => {
    location.current = { pageId, sectionIndex }
    setNotice(null)
  }, [pageId, sectionIndex])

  const isCurrent = useCallback(
    (target: AiEditTarget) =>
      target.pageId === location.current.pageId && target.sectionIndex === location.current.sectionIndex,
    [],
  )

  const reportResult = useCallback(
    (result: unknown, target: AiEditTarget) => {
      if (!isCurrent(target)) return
      const next = aiEditNoticeFor(result)
      if (!next) return
      setNotice(next)
      if (next.kind === "unsupported") {
        setInstruction((current) => current || target.instruction)
      }
    },
    [isCurrent, setInstruction],
  )

  useEffect(() => {
    const settled = tasks.filter(
      (task) => tracked.has(task.taskId) && (task.status === "completed" || task.status === "failed"),
    )
    if (settled.length === 0) return
    setTracked((previous) => {
      const next = new Map(previous)
      for (const task of settled) next.delete(task.taskId)
      return next
    })
    for (const task of settled) {
      const target = tracked.get(task.taskId)!
      if (task.status === "completed") {
        reportResult(task.result, target)
      } else if (isCurrent(target)) {
        onFailed(task.error ?? t`AI edit failed`)
      }
    }
  }, [tasks, tracked, reportResult, isCurrent, onFailed, t])

  const trackSubmission = useCallback((taskId: string, target: AiEditTarget) => {
    setTracked((previous) => new Map(previous).set(taskId, target))
  }, [])

  const dismissNotice = useCallback(() => setNotice(null), [])

  return { notice, dismissNotice, trackSubmission, reportResult }
}
