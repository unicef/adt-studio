import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import type { ReasoningEffort, TaskModelsResponse } from "@adt/types"
import { api } from "@/api/client"
import { toast } from "@/components/ui/sonner"

export const TASK_MODELS_QUERY_KEY = ["task-models"] as const

export interface TaskModelChange {
  id: string
  model?: string | null
  reasoningEffort?: ReasoningEffort | null
}

export interface TaskModelsSave {
  changes: TaskModelChange[]
  defaultReasoningEffort?: ReasoningEffort | null
}

export interface TaskModelsState {
  data: TaskModelsResponse | undefined
  isLoading: boolean
  isError: boolean
  isSaving: boolean
  save: (save: TaskModelsSave) => void
}

export function useTaskModels(): TaskModelsState {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: TASK_MODELS_QUERY_KEY,
    queryFn: api.getTaskModels,
  })

  const mutation = useMutation({
    mutationFn: async ({ changes, defaultReasoningEffort }: TaskModelsSave) => {
      let latest: TaskModelsResponse | undefined
      if (defaultReasoningEffort !== undefined) {
        latest = await api.updateDefaultReasoningEffort(defaultReasoningEffort)
      }
      for (const { id, ...change } of changes) {
        latest = await api.updateTaskModel(id, change)
      }
      return latest
    },
    onSuccess: async (saved) => {
      if (saved) queryClient.setQueryData(TASK_MODELS_QUERY_KEY, saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["global-config"] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "config"] }),
      ])
      toast.success(t`Task models updated.`)
    },
    onError: async (error) => {
      await queryClient.invalidateQueries({ queryKey: TASK_MODELS_QUERY_KEY })
      toast.error(error instanceof Error ? error.message : t`Unable to update the task models.`)
    },
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isSaving: mutation.isPending,
    save: (save) => mutation.mutate(save),
  }
}
