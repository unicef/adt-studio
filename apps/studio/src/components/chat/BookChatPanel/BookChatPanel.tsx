import { useEffect, useRef } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { MessageSquarePlus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useBookChat } from "@/hooks/use-book-chat"
import { ChatApprovalCard } from "./ChatApprovalCard"
import { ChatComposer } from "./ChatComposer"
import { ChatMessageItem, ChatThinking } from "./ChatMessageItem"

interface BookChatPanelProps {
  label: string
  onClose: () => void
}

export function BookChatPanel({ label, onClose }: BookChatPanelProps) {
  const { t } = useLingui()
  const chat = useBookChat(label)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [chat.messages.length, chat.pendingToolCalls.length, chat.busy])

  return (
    <aside aria-label={t`Book assistant`} className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <Select value={chat.threadId ?? ""} onValueChange={(value) => chat.selectThread(value || null)}>
          <SelectTrigger className="h-8 min-w-0 flex-1 text-sm" aria-label={t`Conversation`}>
            <SelectValue placeholder={t`New conversation`} />
          </SelectTrigger>
          <SelectContent>
            {chat.threads.map((thread) => (
              <SelectItem key={thread.id} value={thread.id}>
                {thread.title || t`Untitled conversation`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-8 w-8" title={t`New conversation`} onClick={() => chat.selectThread(null)}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
        {chat.threadId && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title={t`Delete conversation`}
            disabled={chat.busy}
            onClick={() => void chat.deleteThread(chat.threadId ?? "")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8" title={t`Close assistant`} onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" aria-live="polite">
        {chat.messages.length === 0 && !chat.busy && (
          <p className="m-auto max-w-[260px] text-center text-sm text-muted-foreground">
            <Trans>Ask questions about this book or request a change. Changes wait for your approval.</Trans>
          </p>
        )}
        {chat.messages.map((message, index) => (
          <ChatMessageItem key={index} message={message} />
        ))}
        {chat.busy && <ChatThinking />}
        {chat.pendingToolCalls.length > 0 && <ChatApprovalCard calls={chat.pendingToolCalls} onDecide={chat.decide} />}
        {chat.error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {chat.error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <ChatComposer busy={chat.busy} disabled={chat.pendingToolCalls.length > 0} onSend={chat.send} onStop={chat.stop} />
    </aside>
  )
}
