import { useEffect, useMemo, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai"
import { api, chatCredentialHeaders, chatMessagesUrl, type ChatCredentials } from "@/api/client"

export interface ChatScreenContext {
  screen?: string
  pageId?: string
  pageLabel?: string
  sectionIndex?: number
  stage?: string
  language?: string
}

export interface UseBookChatOptions {
  label: string
  threadId: string
  model: string
  locale: string
  credentials: ChatCredentials
  screenContext: ChatScreenContext
  initialMessages: UIMessage[]
  onError?: (error: Error) => void
}

/**
 * One `useChat` instance bound to a persisted thread. Mount this behind a
 * `key={threadId}` so switching threads starts from the stored history rather
 * than mutating a live conversation.
 */
export function useBookChat({
  label,
  threadId,
  model,
  locale,
  credentials,
  screenContext,
  initialMessages,
  onError,
}: UseBookChatOptions) {
  const latest = useRef({ model, locale, credentials, screenContext })
  useEffect(() => {
    latest.current = { model, locale, credentials, screenContext }
  }, [model, locale, credentials, screenContext])

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: chatMessagesUrl(label, threadId),
        headers: () => chatCredentialHeaders(latest.current.credentials),
        body: () => ({
          model: latest.current.model,
          locale: latest.current.locale,
          screenContext: latest.current.screenContext,
        }),
      }),
    [label, threadId],
  )

  const chat = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError,
    // Approvals are recorded with addToolResult; once every pending call has a
    // decision the turn resumes on its own with a fresh request.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })

  const isBusy = chat.status === "submitted" || chat.status === "streaming"

  return {
    ...chat,
    isBusy,
    stopTurn: () => {
      chat.stop()
      void api.cancelChatTurn(label, threadId).catch(() => undefined)
    },
  }
}
