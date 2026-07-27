import { useMemo, useRef, useState, useEffect, Fragment } from "react"
import { useRouterState } from "@tanstack/react-router"
import { MessageCircleQuestion, Send, Sparkles } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useApiKey } from "@/hooks/use-api-key"
import { useAssistantChat } from "@/hooks/use-assistant"
import { useSettingsDialog } from "@/routes/__root"
import type { AssistantChatMessageBody } from "@/api/client"

const NON_BOOK_LABELS = new Set(["new", "import"])

const URL_PATTERN = /(https?:\/\/[^\s]+)/g

function renderMessageContent(content: string) {
  const parts = content.split(URL_PATTERN)
  return parts.map((part, i) =>
    URL_PATTERN.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-primary"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  )
}

function useCurrentBookContext(): { label?: string; pageId?: string } {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return useMemo(() => {
    const parts = pathname.split("/").filter(Boolean)
    if (parts[0] !== "books") return {}
    const label = parts[1]
    if (!label || NON_BOOK_LABELS.has(label)) return {}
    const third = parts[3]
    const pageId = third && third !== "settings" ? third : undefined
    return { label, pageId }
  }, [pathname])
}

export function AssistantWidget() {
  const { t } = useLingui()
  const { label, pageId } = useCurrentBookContext()
  const { apiKey } = useApiKey()
  const { openSettings } = useSettingsDialog()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<AssistantChatMessageBody[]>([])
  const correlationIdRef = useRef<string | undefined>(undefined)
  const scrollRef = useRef<HTMLDivElement>(null)
  const chat = useAssistantChat(label ?? "")

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  if (!label) return null

  const handleSend = () => {
    const message = input.trim()
    if (!message || !apiKey || chat.isPending) return

    const nextMessages: AssistantChatMessageBody[] = [...messages, { role: "user", content: message }]
    setMessages(nextMessages)
    setInput("")

    chat.mutate(
      {
        body: {
          message,
          history: messages,
          pageId,
          correlationId: correlationIdRef.current,
        },
        apiKey,
      },
      {
        onSuccess: (result) => {
          correlationIdRef.current = result.correlationId
          setMessages((prev) => [...prev, { role: "assistant", content: result.reply }])
        },
        onError: (err) => {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: t`Something went wrong: ${err instanceof Error ? err.message : String(err)}` },
          ])
        },
      }
    )
  }

  return (
    <>
      <Button
        variant="default"
        size="icon"
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg transition-shadow hover:shadow-xl"
        onClick={() => setOpen(true)}
        aria-label={t`Open assistant`}
      >
        <MessageCircleQuestion className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="flex-row items-center gap-2.5 space-y-0 border-b px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <SheetTitle className="text-base">
              <Trans>Assistant</Trans>
            </SheetTitle>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                <Trans>Ask about the page you're viewing, or anything about how ADT Studio works — I can see what's on your screen and I'm not limited to it.</Trans>
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                    : "mr-auto max-w-[85%] rounded-2xl border bg-card px-3.5 py-2 text-sm text-card-foreground shadow-sm whitespace-pre-wrap"
                }
              >
                {renderMessageContent(m.content)}
              </div>
            ))}
            {chat.isPending && (
              <div className="mr-auto max-w-[85%] rounded-2xl border bg-card px-3.5 py-2 text-sm text-muted-foreground shadow-sm">
                <Trans>Thinking…</Trans>
              </div>
            )}
          </div>

          {!apiKey ? (
            <div className="space-y-2 border-t bg-muted/30 px-4 py-4">
              <p className="text-sm text-muted-foreground">
                <Trans>Add an API key to use the Assistant.</Trans>
              </p>
              <Button variant="outline" onClick={openSettings}>
                <Trans>Open settings</Trans>
              </Button>
            </div>
          ) : (
            <div className="flex items-end gap-2 border-t bg-muted/30 px-4 py-3">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={t`Ask a question…`}
                className="min-h-[44px] resize-none rounded-xl bg-background"
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                onClick={handleSend}
                disabled={!input.trim() || chat.isPending}
                aria-label={t`Send`}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
