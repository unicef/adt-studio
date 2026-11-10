import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type QuizOption, type QuizzesResponse } from "@/api/client"
import { useDocumentEdits } from "../shared/useDocumentEdits"
import { inDocOrder } from "./quizPages"
import { getQuizzes, quizKey, sameQuiz, setQuizzes, withOption, type QuizDoc, type QuizRow } from "./quizRows"

const setInDocOrder = (doc: QuizDoc, quizzes: QuizRow[]): QuizDoc => setQuizzes(doc, inDocOrder(doc.quizzes, quizzes))

export function useQuizEdits(label: string, data: QuizzesResponse | undefined, locked: boolean, accent: string) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const save = useCallback((next: QuizDoc) => api.updateQuizzes(label, next), [label])
  const afterSave = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "quizzes"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "text-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] }),
      ]),
    [label, queryClient],
  )
  const noun = useMemo(() => ({ one: t`question`, other: t`questions` }), [t])

  const edits = useDocumentEdits<QuizDoc, QuizRow>({
    id: "quizzes",
    stage: "quizzes",
    doc: data?.quizzes,
    versionKey: `${data?.version ?? "none"}:${data?.historyVersion ?? "none"}`,
    getItems: getQuizzes,
    setItems: setInDocOrder,
    keyOf: quizKey,
    isEqual: sameQuiz,
    noun,
    save,
    afterSave,
    locked,
    lockedReason: t`Wait for the quizzes to finish generating.`,
    accent,
  })

  const { update } = edits
  const editQuiz = useCallback((key: string, patch: Partial<QuizRow>) => update(key, patch), [update])
  const editOption = useCallback(
    (key: string, optionIndex: number, patch: Partial<QuizOption>) => update(key, (quiz) => withOption(quiz, optionIndex, patch)),
    [update],
  )
  return { ...edits, editQuiz, editOption }
}

export type QuizEdits = ReturnType<typeof useQuizEdits>
