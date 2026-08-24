import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

function useStepMutation<TVars>(
  label: string,
  key: string,
  mutationFn: (vars: TVars) => Promise<unknown>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, key] })
      queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
    },
  })
}

export function useSaveGlossary(label: string) {
  return useStepMutation(label, "glossary", (data: unknown) => api.updateGlossary(label, data))
}

export function useSaveToc(label: string) {
  return useStepMutation(label, "toc", (data: unknown) => api.updateToc(label, data))
}

export function useSaveQuizzes(label: string) {
  return useStepMutation(label, "quizzes", (data: unknown) => api.updateQuizzes(label, data))
}

export function useSaveTranslation(label: string, language: string) {
  return useStepMutation(label, "text-catalog", (data: unknown) =>
    api.updateTranslation(label, language, data),
  )
}
