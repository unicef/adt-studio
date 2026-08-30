import { useCallback, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { UIMessage } from "ai"
import { PromptInput, type PromptModel } from "@/components/agents/prompt-input"
import type { ChatCredentials, ChatModelOption } from "@/api/client"
import { useChatMutationRefresh } from "@/hooks/use-chat"
import { ChatEmptyState } from "./ChatEmptyState"
import { ChatMessages } from "./ChatMessages"
import { AiPanelShell } from "../AiPanelShell"
import { approvalMarker, type ToolPart } from "./message-parts"
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
  const refreshAfterMutation = useChatMutationRefresh(label)

  const approvedTools = useRef<string[]>([])
  const flushApprovedTools = useCallback(() => {
    if (approvedTools.current.length === 0) return
    const tools = approvedTools.current
    approvedTools.current = []
    refreshAfterMutation(tools)
  }, [refreshAfterMutation])

  const chat = useBookChat({
    label,
    threadId,
    model,
    locale: i18n.locale,
    credentials,
    screenContext,
    initialMessages,
    onFinish: flushApprovedTools,
    onError: flushApprovedTools,
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

  const { addToolResult } = chat
  const decide = useCallback(
    (part: ToolPart, decision: "approved" | "denied") => {
      if (decision === "approved") approvedTools.current.push(part.toolName)
      void addToolResult({
        tool: part.toolName,
        toolCallId: part.toolCallId,
        output: approvalMarker(decision),
      })
    },
    [addToolResult],
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
        label={label}
        messages={chat.messages}
        isBusy={chat.isBusy}
        isStreaming={chat.status === "streaming"}
        error={chat.error}
        emptyState={<ChatEmptyState hasModel={hasModel} onStarter={submit} />}
        onDecide={decide}
      />
    </AiPanelShell>
  )
}
