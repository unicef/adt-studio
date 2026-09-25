import type { QueryClient } from "@tanstack/react-query"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { api, ApiError, type PromptResponse } from "@/api/client"
import { toast } from "@/components/ui/sonner"
import { reconcilePromptDraft, type PromptDraft } from "./types"

async function persistPromptDraft(
  queryClient: QueryClient,
  promptName: string,
  bookLabel: string,
  draft: PromptDraft,
  setDraft?: (update: (current: PromptDraft | null) => PromptDraft | null) => void,
) {
  const queryKey = ["prompts", promptName, bookLabel, draft.modelId]
  let savedPrompt: PromptResponse
  try {
    savedPrompt = await api.updatePrompt(
      promptName,
      draft.content,
      bookLabel,
      draft.modelId,
      draft.revision,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const current = (error.body as { current?: PromptResponse } | null)?.current
      if (current) queryClient.setQueryData(queryKey, current)
      toast.error(i18n._(msg`This prompt changed after you loaded it. Your draft was not overwritten.`), {
        id: "book-prompt-conflict",
      })
    } else {
      // Reconcile an ambiguous network outcome before offering another save.
      await api.getPrompt(promptName, bookLabel, draft.modelId)
        .then((current) => queryClient.setQueryData(queryKey, current))
        .catch(() => {})
      toast.error(i18n._(msg`Save failed`), {
        id: "book-prompt-save-error",
      })
    }
    throw error
  }
  setDraft?.((current) => reconcilePromptDraft(current, draft, savedPrompt.revision))
  queryClient.setQueryData(queryKey, savedPrompt)
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["prompts", promptName, bookLabel, draft.modelId] }),
    queryClient.invalidateQueries({ queryKey: ["prompt-versions", promptName, draft.modelId, bookLabel] }),
  ])
  toast.success(i18n._(msg`Prompt saved to this book.`), {
    id: "book-prompt-save",
  })
  return savedPrompt
}

export function savePromptDraft(
  queryClient: QueryClient, promptName: string, bookLabel: string, draft: PromptDraft,
  setDraft?: (update: (current: PromptDraft | null) => PromptDraft | null) => void,
) {
  return queryClient.getMutationCache().build(queryClient, {
    mutationKey: ["prompt-save", bookLabel, promptName, draft.modelId],
    mutationFn: () => persistPromptDraft(queryClient, promptName, bookLabel, draft, setDraft),
  }).execute(undefined)
}
