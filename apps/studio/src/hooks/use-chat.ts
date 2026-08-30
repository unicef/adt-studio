import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type ChatCredentials, type ChatThreadSummary } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"

export function useChatCredentials(): ChatCredentials {
  const { apiKey, anthropicKey, googleKey } = useApiKey()
  return {
    openaiApiKey: apiKey || undefined,
    anthropicApiKey: anthropicKey || undefined,
    googleApiKey: googleKey || undefined,
  }
}

export function useChatModels(label: string, credentials: ChatCredentials) {
  const fingerprint = [
    credentials.openaiApiKey ? "openai" : "",
    credentials.anthropicApiKey ? "anthropic" : "",
    credentials.googleApiKey ? "google" : "",
  ].join(",")

  return useQuery({
    queryKey: ["books", label, "chat", "models", fingerprint],
    queryFn: () => api.getChatModels(label, credentials),
    enabled: !!label,
    staleTime: Infinity,
  })
}

export function useChatThreads(label: string, enabled = true) {
  return useQuery({
    queryKey: ["books", label, "chat", "threads"],
    queryFn: () => api.getChatThreads(label),
    enabled: !!label && enabled,
  })
}

export function useChatThread(label: string, threadId: string | null) {
  return useQuery({
    queryKey: ["books", label, "chat", "threads", threadId],
    queryFn: () => api.getChatThread(label, threadId as string),
    enabled: !!label && !!threadId,
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function useChatToolPreview(
  label: string,
  toolName: string,
  toolCallId: string,
  input: unknown,
) {
  return useQuery({
    queryKey: ["books", label, "chat", "tool-preview", toolCallId],
    queryFn: () => api.getChatToolPreview(label, toolName, input),
    enabled: !!label && !!toolName,
    staleTime: 30_000,
    retry: false,
  })
}

export function useChatThreadMutations(label: string) {
  const queryClient = useQueryClient()
  const threadsKey = ["books", label, "chat", "threads"]
  const invalidate = () => queryClient.invalidateQueries({ queryKey: threadsKey })

  const create = useMutation({
    mutationFn: (body: { model?: string; title?: string }) =>
      api.createChatThread(label, body),
    onSuccess: (thread: ChatThreadSummary) => {
      queryClient.setQueryData<{ threads: ChatThreadSummary[] }>(threadsKey, (previous) => ({
        threads: [thread, ...(previous?.threads ?? [])],
      }))
    },
  })

  const update = useMutation({
    mutationFn: ({
      threadId,
      ...body
    }: {
      threadId: string
      model?: string
      title?: string
    }) => api.updateChatThread(label, threadId, body),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (threadId: string) => api.deleteChatThread(label, threadId),
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
