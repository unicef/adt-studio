import { useRef, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Loader2, MapPin, MapPinOff, RotateCcw, SendHorizontal, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RelativeTime } from "@/components/publication-feedback/RelativeTime"
import { initialOf } from "@/components/publication-feedback/lib/initial"
import { cn } from "@/lib/utils"
import { isPlaced, type CommentPin, type SectionComments } from "./use-section-comments"

/** The modifier for "send", as the keyboard in front of the author labels it. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- key names, not user text
const SEND_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"

/** One comment: who, where on the page, what, the replies, and the two things to do about it. */
export function CommentThread({
  pin,
  comments,
  onClose,
}: {
  pin: CommentPin
  comments: SectionComments
  onClose?: () => void
}) {
  const { t } = useLingui()
  const { thread } = pin
  const held = comments.held.isHeld(thread.root.id)
  const failed = comments.held.failed.has(thread.root.id)
  const replies = thread.replies.filter((entry) => entry.deleted_at === null)

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <header className="flex items-start gap-2.5">
        <Avatar name={thread.root.author_name} color={thread.root.author_color} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">{thread.root.author_name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              <RelativeTime iso={thread.root.created_at} />
            </span>
          </span>
          {pin.stale ? (
            <span className="text-[11px] text-muted-foreground">
              <Trans>Left on version {thread.version}</Trans>
            </span>
          ) : null}
        </span>
        <Status resolved={thread.resolved || held} />
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Close this comment`}
            className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <Location pin={pin} />

      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{thread.root.body}</p>

      {replies.length > 0 ? (
        <ol className="flex max-h-40 list-none flex-col gap-2 overflow-y-auto border-l-2 border-muted p-0 pl-3">
          {replies.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <Avatar name={entry.author_name} color={entry.author_color} small />
              <span className="min-w-0 text-xs leading-5">
                <span className="font-semibold text-foreground">{entry.author_name}</span>{" "}
                <span className="text-muted-foreground">
                  <RelativeTime iso={entry.created_at} />
                </span>
                <span className="block whitespace-pre-wrap text-foreground/85">{entry.body}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <Composer key={thread.root.id} comments={comments} pin={pin} />

      <div className="flex items-center gap-2">
        <Stepper comments={comments} />
        <span className="ml-auto flex items-center gap-2">
          {failed && !held && !thread.resolved ? (
            <span role="alert" className="text-[11px] text-amber-700 dark:text-amber-300">
              <Trans>Didn't resolve.</Trans>
            </span>
          ) : null}
          {held ? (
            <span className="flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 pl-2 text-xs font-medium text-emerald-700 motion-safe:animate-in motion-safe:fade-in-0 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Check className="size-3.5" aria-hidden="true" />
              <span role="status">
                <Trans>Resolved</Trans>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-100"
                onClick={() => comments.held.undo(thread.root.id)}
              >
                <Undo2 aria-hidden="true" />
                <Trans>Undo</Trans>
              </Button>
            </span>
          ) : thread.resolved ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-amber-200 bg-amber-50 text-xs text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
              onClick={() => comments.reopen(thread.root.id)}
            >
              <RotateCcw aria-hidden="true" />
              <Trans>Reopen</Trans>
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 bg-emerald-600 text-xs text-white shadow-sm hover:bg-emerald-700"
              onClick={() => comments.held.hold(thread.root.id)}
            >
              <Check aria-hidden="true" />
              {failed ? <Trans>Try again</Trans> : <Trans>Resolve</Trans>}
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}

/** "‹ 3 of 13 ›" — walking the page's comments without hunting for the next pin. */
export function Stepper({ comments, className }: { comments: SectionComments; className?: string }) {
  const { t } = useLingui()
  const total = comments.ordered.length
  if (total < 2) return null
  const position = comments.index + 1
  return (
    <span className={cn("flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground", className)}>
      <StepButton label={t`Previous comment`} onClick={comments.previous}>
        <ChevronLeft className="size-3.5" aria-hidden="true" />
      </StepButton>
      <span className="min-w-12 text-center">
        {position > 0 ? <Trans>{position} of {total}</Trans> : <Trans>{total} here</Trans>}
      </span>
      <StepButton label={t`Next comment`} onClick={comments.next}>
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </StepButton>
    </span>
  )
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-md transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {children}
    </button>
  )
}

/** Where the comment is, in the same words the Sharing dashboard uses. */
export function Location({ pin }: { pin: CommentPin }) {
  if (isPlaced(pin)) {
    return (
      <p className="flex items-start gap-2 border-l-2 border-brand-400 pl-2.5 text-xs leading-snug text-muted-foreground">
        {pin.picture ? (
          <ImageIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <MapPin className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="line-clamp-2 min-w-0">
          {pin.picture ? (
            pin.quote ? (
              <Trans>
                On the picture: <span className="text-foreground/85">{pin.quote}</span>
              </Trans>
            ) : (
              <Trans>On a picture</Trans>
            )
          ) : pin.quote ? (
            <Trans>
              On “<span className="text-foreground/85">{pin.quote}</span>”
            </Trans>
          ) : (
            <Trans>On the marked spot</Trans>
          )}
        </span>
      </p>
    )
  }
  if (pin.reason === "page-level") {
    return (
      <p className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
        <Trans>On the page as a whole</Trans>
      </p>
    )
  }
  if (pin.reason === "measuring") {
    return <span aria-hidden="true" className="h-7 rounded-md bg-muted/60 motion-safe:animate-pulse" />
  }
  return (
    <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <MapPinOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {pin.stale ? (
        <Trans>This spot has changed since version {pin.thread.version}, so it can't be pinned.</Trans>
      ) : (
        <Trans>What this comment was on isn't on the page any more.</Trans>
      )}
    </p>
  )
}

function Composer({ comments, pin }: { comments: SectionComments; pin: CommentPin }) {
  const { t } = useLingui()
  const [body, setBody] = useState("")
  const [failed, setFailed] = useState(false)
  const [focused, setFocused] = useState(false)
  const sending = useRef(false)
  const open = focused || body !== ""
  const author = pin.thread.root.author_name
  const send = async () => {
    const text = body.trim()
    if (text === "" || sending.current) return
    sending.current = true
    setFailed(false)
    try {
      await comments.reply(pin.thread, text)
      setBody("")
    } catch {
      setFailed(true)
    } finally {
      sending.current = false
    }
  }
  return (
    <div className="rounded-lg border bg-background transition-shadow duration-150 focus-within:ring-2 focus-within:ring-ring motion-reduce:transition-none">
      <textarea
        value={body}
        onChange={(event) => {
          setBody(event.target.value)
          setFailed(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void send()
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={open ? 3 : 1}
        placeholder={t`Reply to ${author}…`}
        aria-label={t`Reply to ${author}`}
        className="block w-full resize-none rounded-lg bg-transparent px-2.5 py-2 text-xs leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      {open ? (
        <div className="flex items-center justify-between gap-2 border-t px-1.5 py-1 motion-safe:animate-in motion-safe:fade-in-0">
          <span className="min-w-0 truncate px-1 text-[10.5px] text-muted-foreground">
            {failed ? (
              <span className="text-amber-700 dark:text-amber-300">
                <Trans>That reply didn't send. Try again.</Trans>
              </span>
            ) : (
              <Trans>{SEND_KEY} Enter to send</Trans>
            )}
          </span>
          <Button
            size="sm"
            className="h-6 bg-brand-600 px-2 text-[11px] text-white hover:bg-brand-700"
            disabled={body.trim() === "" || comments.replying}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void send()}
          >
            {comments.replying ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <SendHorizontal aria-hidden="true" />
            )}
            <Trans>Reply</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function Status({ resolved }: { resolved: boolean }) {
  if (resolved) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
        <Check className="size-3" aria-hidden="true" />
        <Trans>Resolved</Trans>
      </span>
    )
  }
  return null
}

export function Avatar({ name, color, small = false, className }: { name: string; color: string; small?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full rounded-bl-none font-bold text-white",
        small ? "mt-0.5 size-5 text-[10px]" : "size-7 text-xs",
        className,
      )}
    >
      {initialOf(name)}
    </span>
  )
}
