import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { MessageSquarePlus, Sparkles, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ChatScope } from "@adt/types"
import { useBookChat } from "@/hooks/use-book-chat"
import { ChatApprovalCard } from "./ChatApprovalCard"
import { ChatComposer } from "./ChatComposer"
import { ChatMessageItem, ChatThinking } from "./ChatMessageItem"
import { toolResultsById } from "./tool-calls"

interface BookChatPanelProps {
  label: string
  scope: ChatScope
  onClose: () => void
}

function ChatSuggestions({ scope, onPick }: { scope: ChatScope; onPick: (text: string) => void }) {
  const { t } = useLingui()
  const suggestions =
    scope === "reader"
      ? [t`Make the navigation buttons larger`, t`Use the book's colors in the reader`, t`Where is the bottom bar defined?`]
      : [t`What is this book about?`, t`Which pages have activities?`, t`Suggest improvements for the first page`]
  return (
    <div className="m-auto flex max-w-[300px] flex-col items-center gap-3 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium"><Trans>How can I help with this book?</Trans></p>
        <p className="text-xs text-muted-foreground">
          <Trans>Ask questions about this book or request a change. Changes wait for your approval.</Trans>
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-1.5 self-stretch">
        {suggestions.map((suggestion) => (
          <Button key={suggestion} variant="outline" size="sm" className="h-auto justify-start py-1.5 text-left text-xs font-normal whitespace-normal" onClick={() => onPick(suggestion)}>
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function BookChatPanel({ label, scope, onClose }: BookChatPanelProps) {
  const { t } = useLingui()
  const chat = useBookChat(label, scope)
  const results = useMemo(() => toolResultsById(chat.messages), [chat.messages])
  const awaitingIds = useMemo(() => new Set(chat.pendingToolCalls.map((call) => call.id)), [chat.pendingToolCalls])
  const empty = chat.messages.length === 0 && !chat.busy

  return (
    <aside aria-label={t`Book assistant`} className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-muted/20">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-background px-2">
        <Select value={chat.threadId ?? ""} onValueChange={(value) => chat.selectThread(value || null)}>
          <SelectTrigger className="h-8 min-w-0 flex-1 border-none text-sm shadow-none" aria-label={t`Conversation`}>
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

      {empty ? (
        <div className="flex min-h-0 flex-1 overflow-y-auto p-4">
          <ChatSuggestions scope={scope} onPick={chat.send} />
        </div>
      ) : (
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport aria-live="polite">
              <MessageScrollerContent className="gap-4 p-3">
                {chat.messages.map((message, index) =>
                  message.role === "tool" ? null : (
                    <MessageScrollerItem key={index} messageId={String(index)} scrollAnchor={message.role === "user"}>
                      <ChatMessageItem message={message} results={results} awaitingIds={awaitingIds} busy={chat.busy} />
                    </MessageScrollerItem>
                  ),
                )}
                {chat.busy && (
                  <MessageScrollerItem messageId="thinking">
                    <ChatThinking />
                  </MessageScrollerItem>
                )}
                {chat.pendingToolCalls.length > 0 && (
                  <MessageScrollerItem messageId="approval">
                    <ChatApprovalCard label={label} calls={chat.pendingToolCalls} onDecide={chat.decide} />
                  </MessageScrollerItem>
                )}
                {chat.error && (
                  <MessageScrollerItem messageId="error">
                    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {chat.error}
                    </p>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton label={t`Scroll to the latest message`} />
          </MessageScroller>
        </MessageScrollerProvider>
      )}

      <ChatComposer busy={chat.busy} disabled={chat.pendingToolCalls.length > 0} mode={chat.mode} onModeChange={chat.setMode} onSend={chat.send} onStop={chat.stop} />
    </aside>
  )
}
