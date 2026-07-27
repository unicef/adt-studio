import { useMutation } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { AssistantChatRequestBody } from "@/api/client"

export function useAssistantChat(label: string) {
  return useMutation({
    mutationFn: ({ body, apiKey }: { body: AssistantChatRequestBody; apiKey: string }) =>
      api.sendAssistantMessage(label, body, apiKey),
  })
}
