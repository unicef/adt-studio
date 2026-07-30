import type { QueryClient } from "@tanstack/react-query"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { api, ApiError, type PromptResponse } from "@/api/client"
import { toast } from "@/components/ui/sonner"
import type { PromptDraft } from "./types"

export async function savePromptDraft(
  queryClient: QueryClient,
  promptName: string,
  bookLabel: string,
  draft: PromptDraft,
) {
  const queryKey = ["prompts", promptName, bookLabel, draft.modelId]
  const loadedPrompt = queryClient.getQueryData<PromptResponse>(queryKey)
  let savedPrompt: PromptResponse
  try {
    savedPrompt = await api.updatePrompt(
      promptName,
      draft.content,
      bookLabel,
      draft.modelId,
      loadedPrompt?.revision,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const current = (error.body as { current?: PromptResponse } | null)?.current
      if (current) queryClient.setQueryData(queryKey, current)
    }
    throw error
  }
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
