import { useCallback, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { UIMessage } from "ai"
import { PromptInput, type PromptModel } from "@/components/agents/prompt-input"
import type { ChatCredentials, ChatModelOption } from "@/api/client"
import { ChatEmptyState } from "./ChatEmptyState"
import { ChatMessages } from "./ChatMessages"
import { AiPanelShell } from "../AiPanelShell"
import { useBookChat, type ChatScreenContext } from "./useBookChat"

export interface ChatConversationProps {
  label: string
  threadId: string
  initialMessages: UIMessage[]
  models: ChatModelOption[]
  model: string
  onModelChange: (model: string) => void
  credentials: ChatCredentials
  screenContext: ChatScreenContext
  title: React.ReactNode
  meta: React.ReactNode
  onCollapse: () => void
  composerLeadingAction: React.ReactNode
  onFirstMessage: () => void
}

export function ChatConversation({
  label,
  threadId,
  initialMessages,
  models,
  model,
  onModelChange,
  credentials,
  screenContext,
  title,
  meta,
  onCollapse,
  composerLeadingAction,
  onFirstMessage,
}: ChatConversationProps) {
  const { t, i18n } = useLingui()
  const [draft, setDraft] = useState("")

  const chat = useBookChat({
    label,
    threadId,
    model,
    locale: i18n.locale,
    credentials,
    screenContext,
    initialMessages,
  })

  const { sendMessage, messages } = chat
  const hasModel = models.length > 0

  const submit = useCallback(
    (prompt: string) => {
      const text = prompt.trim()
      if (!text || !hasModel) return
      if (messages.length === 0) onFirstMessage()
      void sendMessage({ text })
      setDraft("")
    },
    [hasModel, messages.length, onFirstMessage, sendMessage],
  )

  const promptModels: PromptModel[] = models.map((option) => ({
    value: option.id,
    label: option.label,
  }))

  return (
    <AiPanelShell
      title={title}
      meta={meta}
      onCollapse={onCollapse}
      footer={
        <PromptInput
          value={draft}
          onValueChange={setDraft}
          onSubmit={submit}
          models={promptModels}
          model={model}
          onModelChange={onModelChange}
          loading={chat.isBusy}
          onStop={chat.stopTurn}
          disabled={!hasModel}
          minRows={1}
          maxRows={6}
          leadingAction={composerLeadingAction}
          placeholder={t`Ask about this book…`}
          aria-label={t`Message the assistant`}
        />
      }
    >
      <ChatMessages
        messages={chat.messages}
        isBusy={chat.isBusy}
        isStreaming={chat.status === "streaming"}
        error={chat.error}
        emptyState={<ChatEmptyState hasModel={hasModel} onStarter={submit} />}
      />
    </AiPanelShell>
  )
}
