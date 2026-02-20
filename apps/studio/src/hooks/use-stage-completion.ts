import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useIsStageDone(bookLabel: string, stageSlug: string): boolean {
  const { data } = useQuery({
    queryKey: ["books", bookLabel, "step-status"],
    queryFn: () => api.getStepStatus(bookLabel),
    enabled: !!bookLabel,
  })

  return !!data?.steps?.[stageSlug]
}
