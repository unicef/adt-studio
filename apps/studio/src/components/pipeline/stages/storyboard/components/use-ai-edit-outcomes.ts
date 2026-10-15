import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { useLingui } from "@lingui/react/macro"
import type { TaskInfoResponse } from "@/api/client"
import { aiEditNoticeFor, type AiEditOutcomeNotice } from "../lib/ai-edit-outcome"

export function useAiEditOutcomes(
  tasks: TaskInfoResponse[],
  onFailed: (message: string) => void,
  setInstruction: Dispatch<SetStateAction<string>>,
) {
  const { t } = useLingui()
  const [notice, setNotice] = useState<AiEditOutcomeNotice | null>(null)
  const submittedInstructions = useRef(new Map<string, string>())

  const reportResult = useCallback(
    (result: unknown, instruction: string) => {
      const next = aiEditNoticeFor(result)
      if (!next) return
      setNotice(next)
      if (next.kind === "unsupported") {
        setInstruction((current) => current || instruction)
      }
    },
    [setInstruction],
  )

  useEffect(() => {
    for (const task of tasks) {
      const instruction = submittedInstructions.current.get(task.taskId)
      if (instruction === undefined) continue
      if (task.status === "completed") {
        submittedInstructions.current.delete(task.taskId)
        reportResult(task.result, instruction)
      } else if (task.status === "failed") {
        submittedInstructions.current.delete(task.taskId)
        onFailed(task.error ?? t`AI edit failed`)
      }
    }
  }, [tasks, reportResult, onFailed, t])

  const trackSubmission = useCallback((taskId: string, instruction: string) => {
    submittedInstructions.current.set(taskId, instruction)
  }, [])

  const dismissNotice = useCallback(() => setNotice(null), [])

  return { notice, dismissNotice, trackSubmission, reportResult }
}
