import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useQuizzes(label: string) {
  return useQuery({
    queryKey: ["books", label, "quizzes"],
    queryFn: () => api.getQuizzes(label),
    enabled: !!label,
  })
}
