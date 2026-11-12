import { refreshRunStatus } from "./run-query-invalidation"
import { useMutationState, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type StageRunStatus } from "@/api/client"

/** Keep accepted run IDs in the book's query cache, independent of a dialog's
 * lifetime. Match the server's active/queued IDs so an unrelated later run can
 * never inherit this action's Updating indicator. */
export function useOutputReviewRun(bookLabel: string) {
  const client = useQueryClient()
  const key = ["books", bookLabel, "output-review-runs"]
  const { data: ids = [] } = useQuery<string[]>({
    queryKey: key,
    queryFn: () => [],
    initialData: [],
    enabled: false,
    gcTime: 24 * 60 * 60 * 1000,
  })
  const pending = useMutationState({
    filters: { mutationKey: ["books", bookLabel, "output-review"], status: "pending" },
    select: (mutation) => mutation.state.variables === "update" || mutation.state.variables === "replace",
  }).some(Boolean)
  const ownsActiveRun = (status: StageRunStatus | undefined) => ids.some((id) =>
    (status?.id === id && ["running", "cancelling"].includes(status.status)) ||
    status?.queue?.some((run) => run.id === id)
  )
  const { data: status } = useQuery({
    queryKey: ["books", bookLabel, "output-review-status", ids],
    queryFn: () => api.getStagesStatus(bookLabel),
    enabled: ids.length > 0,
    refetchInterval: (query) => !query.state.data || ownsActiveRun(query.state.data) ? 2000 : false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  return {
    updating: pending || ownsActiveRun(status) || (ids.length > 0 && !status),
    accepted: async (id: string) => {
      client.setQueryData<string[]>(key, (previous = []) => [...new Set([...previous, id])])
      await Promise.all([
        client.invalidateQueries({ queryKey: ["books", bookLabel, "output-review-status"] }),
        refreshRunStatus(client, bookLabel),
      ])
    },
  }
}
