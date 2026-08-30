import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { UIMessage } from "ai"
import {
  useChatCredentials,
  useChatModels,
  useChatThread,
  useChatThreadMutations,
  useChatThreads,
} from "@/hooks/use-chat"
import { ChatConversation } from "./ChatConversation"
import { ChatEmptyState } from "./ChatEmptyState"
import { AiPanelShell } from "../AiPanelShell"
import { ChatThreadMenu } from "./ChatThreadMenu"
import type { ChatScreenContext } from "./useBookChat"

export interface ChatPanelProps {
  label: string
  open: boolean
  title: React.ReactNode
  onCollapse: () => void
  screenContext: ChatScreenContext
}

export function ChatPanel({
  label,
  open,
  title,
  onCollapse,
  screenContext,
}: ChatPanelProps) {
  const { t } = useLingui()
  const credentials = useChatCredentials()
  const models = useChatModels(label, credentials)
  const threads = useChatThreads(label, open)
  const mutations = useChatThreadMutations(label)

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")

  const threadList = useMemo(() => threads.data?.threads ?? [], [threads.data])
  const modelOptions = useMemo(() => models.data?.models ?? [], [models.data])

  useEffect(() => {
    if (!open || activeThreadId) return
    const mostRecent = threadList[0]
    if (mostRecent) setActiveThreadId(mostRecent.threadId)
  }, [activeThreadId, open, threadList])

  const createThread = mutations.create.mutate
  const isCreating = mutations.create.isPending
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (!open || !threads.isSuccess || threadList.length > 0) return
    if (bootstrapped.current || isCreating) return
    bootstrapped.current = true
    createThread(
      { model: modelOptions[0]?.id },
      { onSuccess: (thread) => setActiveThreadId(thread.threadId) },
    )
  }, [createThread, isCreating, modelOptions, open, threadList.length, threads.isSuccess])

  const activeThread = useChatThread(label, open ? activeThreadId : null)
  const activeSummary = threadList.find((thread) => thread.threadId === activeThreadId)

  const storedModel = activeThread.data?.model ?? activeSummary?.model
  const model =
    storedModel && modelOptions.some((option) => option.id === storedModel)
      ? storedModel
      : (modelOptions[0]?.id ?? "")

  const updateThread = mutations.update.mutate
  const handleModelChange = useCallback(
    (next: string) => {
      if (!activeThreadId || next === model) return
      updateThread({ threadId: activeThreadId, model: next })
    },
    [activeThreadId, model, updateThread],
  )

  const handleCreate = useCallback(() => {
    createThread(
      { model: model || undefined },
      { onSuccess: (thread) => setActiveThreadId(thread.threadId) },
    )
  }, [createThread, model])

  const removeThread = mutations.remove.mutate
  const handleDelete = useCallback(
    (threadId: string) => {
      removeThread(threadId, {
        onSuccess: () => {
          bootstrapped.current = false
          setActiveThreadId(null)
        },
      })
    },
    [removeThread],
  )

  const startRename = useCallback(
    (threadId: string) => {
      setRenaming(threadId)
      setRenameDraft(
        threadList.find((thread) => thread.threadId === threadId)?.title ?? "",
      )
    },
    [threadList],
  )

  const commitRename = useCallback(() => {
    if (!renaming) return
    const title = renameDraft.trim()
    if (title) updateThread({ threadId: renaming, title })
    setRenaming(null)
  }, [renameDraft, renaming, updateThread])

  const threadMenu = (
    <ChatThreadMenu
      threads={threadList}
      activeThreadId={activeThreadId}
      onSelect={setActiveThreadId}
      onCreate={handleCreate}
      onRename={startRename}
      onDelete={handleDelete}
      disabled={!open}
    />
  )

  const meta = renaming ? (
    <input
      autoFocus
      value={renameDraft}
      onChange={(event) => setRenameDraft(event.target.value)}
      onBlur={commitRename}
      onKeyDown={(event) => {
        if (event.key === "Enter") commitRename()
        if (event.key === "Escape") setRenaming(null)
      }}
      aria-label={t`Chat name`}
      className="w-full min-w-0 rounded-md border bg-background px-1.5 py-0.5 text-[11px] outline-none focus:border-brand-400"
    />
  ) : (
    (activeSummary?.title ?? "")
  )

  const initialMessages = (activeThread.data?.messages ?? []) as UIMessage[]
  const ready = Boolean(activeThreadId) && activeThread.isSuccess

  if (!ready) {
    return (
      <AiPanelShell
        title={title}
        meta={meta}
        onCollapse={onCollapse}
        footer={
          <div className="h-[52px] rounded-2xl border border-border/80 bg-background" />
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {modelOptions.length === 0 && models.isSuccess ? (
            <ChatEmptyState hasModel={false} onStarter={() => undefined} />
          ) : (
            <p className="px-3.5 py-8 text-center text-[11.5px] text-muted-foreground">
              <Trans>Loading the conversation…</Trans>
            </p>
          )}
        </div>
      </AiPanelShell>
    )
  }

  return (
    <ChatConversation
      key={activeThreadId}
      label={label}
      threadId={activeThreadId as string}
      initialMessages={initialMessages}
      models={modelOptions}
      model={model}
      onModelChange={handleModelChange}
      credentials={credentials}
      screenContext={screenContext}
      title={title}
      meta={meta}
      onCollapse={onCollapse}
      composerLeadingAction={threadMenu}
      onFirstMessage={() => threads.refetch()}
    />
  )
}
