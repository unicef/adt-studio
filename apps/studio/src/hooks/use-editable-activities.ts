import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type StageRunProviderCredentials } from "@/api/client"
import type { EditableActivity } from "@adt/types"

/** Per-page editable (step-by-step) activities — separate `editable-activity`
 *  node, fully independent from the storyboard's web-rendering data. */
export function useEditableActivities(label: string, pageId: string, enabled = true) {
  return useQuery({
    queryKey: ["editable-activities", label, pageId],
    queryFn: () => api.getEditableActivities(label, pageId),
    enabled: enabled && !!label && !!pageId,
  })
}

export function useConvertEditableActivity(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sectionIndex: number) =>
      api.convertEditableActivity(label, pageId, sectionIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["editable-activities", label, pageId] })
    },
  })
}

export function useSaveEditableActivities(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (activities: Record<string, EditableActivity>) =>
      api.updateEditableActivities(label, pageId, activities),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["editable-activities", label, pageId] })
    },
  })
}

export function useSetEditableActivityPresentation(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionIndex, enabled }: { sectionIndex: number; enabled: boolean }) =>
      api.setEditableActivityPresentation(label, pageId, sectionIndex, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["editable-activities", label, pageId] })
    },
  })
}

/** LLM feedback generation — results go into the editor draft, not storage;
 *  the user reviews/edits and saves through the normal PUT. */
export function useGenerateActivityFeedback(label: string, pageId: string) {
  return useMutation({
    mutationFn: ({
      sectionIndex,
      apiKey,
      providerCredentials,
      activity,
    }: {
      sectionIndex: number
      apiKey: string
      providerCredentials?: StageRunProviderCredentials
      activity?: EditableActivity
    }) =>
      api.generateEditableActivityFeedback(
        label,
        pageId,
        sectionIndex,
        apiKey,
        providerCredentials,
        activity,
      ),
  })
}
