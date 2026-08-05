import type { QueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { PromptDraft } from "./types"

export async function savePromptDraft(
  queryClient: QueryClient,
  promptName: string,
  bookLabel: string,
  draft: PromptDraft,
) {
  const savedPrompt = await api.updatePrompt(promptName, draft.content, bookLabel, draft.modelId)
  queryClient.setQueryData(["prompts", promptName, bookLabel, draft.modelId], savedPrompt)
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["prompts", promptName, bookLabel, draft.modelId] }),
    queryClient.invalidateQueries({ queryKey: ["prompt-versions", promptName, draft.modelId, bookLabel] }),
  ])
  return savedPrompt
}
