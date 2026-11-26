import { useCallback, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { ChatMessage, ChatMode, ChatThread } from "@adt/types"
import { api } from "@/api/client"

type ChatInput = { text: string; images: string[] } | { decisions: Record<string, boolean> }

const threadsKey = (label: string) => ["books", label, "chat", "threads"]
const threadKey = (label: string, id: string | null) => ["books", label, "chat", "thread", id]

export function useBookChat(label: string) {
  const queryClient = useQueryClient()
  const [threadId, setThreadId] = useState<string | null>(null)
  const [live, setLive] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode>("manual")
  const abortRef = useRef<AbortController | null>(null)

  const threads = useQuery({
    queryKey: threadsKey(label),
    queryFn: async () => (await api.listChatThreads(label)).threads,
  })
  const thread = useQuery({
    queryKey: threadKey(label, threadId),
    queryFn: () => api.getChatThread(label, threadId ?? ""),
    enabled: threadId !== null,
  })

  const run = useCallback(
    async (input: ChatInput) => {
      let id = threadId
      if (!id) {
        const created = await api.createChatThread(label)
        queryClient.setQueryData<ChatThread>(threadKey(label, created.id), created)
        id = created.id
        setThreadId(id)
      }
      const controller = new AbortController()
      abortRef.current = controller
      setBusy(true)
      setError(null)
      setLive("text" in input ? [{ role: "user", content: input.text, images: input.images }] : [])
      try {
        await api.streamChatTurn(
          label,
          id,
          { ...input, mode },
          (event) => {
            if (event.type === "message") setLive((previous) => [...previous, event.message])
            else if (event.type === "done") {
              queryClient.setQueryData<ChatThread>(threadKey(label, id), event.thread)
              setLive([])
            } else setError(event.message)
          },
          controller.signal,
        )
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      } finally {
        abortRef.current = null
        setBusy(false)
        void queryClient.invalidateQueries({ queryKey: ["books", label] })
      }
    },
    [label, mode, queryClient, threadId],
  )

  const selectThread = useCallback((id: string | null) => {
    abortRef.current?.abort()
    setThreadId(id)
    setLive([])
    setError(null)
  }, [])

  const deleteThread = useCallback(
    async (id: string) => {
      await api.deleteChatThread(label, id)
      if (id === threadId) selectThread(null)
      void queryClient.invalidateQueries({ queryKey: threadsKey(label) })
    },
    [label, queryClient, selectThread, threadId],
  )

  return {
    threads: threads.data ?? [],
    threadId,
    title: thread.data?.title ?? "",
    messages: [...(thread.data?.messages ?? []), ...live],
    pendingToolCalls: busy ? [] : (thread.data?.pendingToolCalls ?? []),
    busy,
    error,
    mode,
    setMode,
    send: (text: string, images: string[] = []) => run({ text, images }),
    decide: (decisions: Record<string, boolean>) => run({ decisions }),
    stop: () => abortRef.current?.abort(),
    selectThread,
    deleteThread,
  }
}

export type BookChat = ReturnType<typeof useBookChat>
