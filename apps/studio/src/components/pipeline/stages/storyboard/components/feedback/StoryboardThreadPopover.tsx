import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, CornerDownRight, Loader2, PencilLine, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RelativeTime } from "@/components/publication-feedback/RelativeTime"
import {
  useAuthorIdentity,
  useReplyToThread,
  useResolveThread,
} from "@/hooks/use-publication-feedback"
import { PUBLISH_AUTHOR_DEFAULT_NAME } from "@adt/types"
import { cn } from "@/lib/utils"
import type { PlacedPin, UnplacedPin } from "./storyboard-pins"

/**
 * One thread, answered where it was left.
 *
 * A panel on the far side of the screen would put the comment one context away from the thing it
 * is about, which is the whole problem moving feedback into the storyboard was meant to solve —
 * so this opens on the canvas, beside its pin.
 *
 * It is also the surface the assistant will eventually hang off: the thread it holds carries the
 * comment's id, its page section and its anchor selector, and that selector is the same `data-id`
 * the storyboard's edit path writes to. "Fix what this comment asks for" is a button away from
 * here, not a rebuild.
 */
export function StoryboardThreadPopover({
  bookLabel,
  pin,
  onClose,
}: {
  bookLabel: string
  pin: PlacedPin | UnplacedPin
  onClose: () => void
}) {
  const { t } = useLingui()
  const identity = useAuthorIdentity(PUBLISH_AUTHOR_DEFAULT_NAME)
  const reply = useReplyToThread(bookLabel, identity.authorName)
  const resolve = useResolveThread(bookLabel, identity.authorName)
  const [draft, setDraft] = useState("")

  const { thread } = pin
  const placed = "x" in pin
  const busy = reply.isPending || resolve.isPending

  function send() {
    const body = draft.trim()
    if (body.length === 0) return
    reply.mutate(
      { parentId: thread.root.id, pageSectionId: thread.pageSectionId, body },
      { onSuccess: () => setDraft("") },
    )
  }

  return (
    <div
      role="dialog"
      aria-label={t`Comment from ${thread.root.author_name}`}
      data-testid="storyboard-thread-popover"
      style={placed ? { left: `${(pin as PlacedPin).x}px`, top: `${(pin as PlacedPin).y}px` } : undefined}
      className={cn(
        "absolute z-30 flex w-[19rem] max-w-[85%] flex-col gap-2.5 rounded-xl border bg-popover p-3 shadow-xl",
        "duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-reduce:animate-none",
        placed ? "-translate-x-1/2 translate-y-2" : "bottom-3 left-3",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          style={{ backgroundColor: thread.root.author_color }}
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full rounded-bl-none text-[11px] font-bold text-white"
        >
          {[...thread.root.author_name][0]?.toUpperCase() ?? "?"}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-semibold text-foreground">
              {thread.root.author_name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              <RelativeTime iso={thread.root.created_at} />
            </span>
          </span>
          {pin.stale ? (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
              <PencilLine className="size-3 shrink-0" aria-hidden="true" />
              <Trans>Written about an older version of this page</Trans>
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t`Close this comment`}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-foreground/90">
        {thread.root.body}
      </p>

      {thread.replies.length > 0 ? (
        <ul className="flex max-h-32 list-none flex-col gap-1.5 overflow-y-auto border-t p-0 pt-2">
          {thread.replies
            .filter((entry) => entry.deleted_at === null)
            .map((entry) => (
              <li key={entry.id} className="flex gap-1.5 text-xs leading-5">
                <CornerDownRight
                  className="mt-0.5 size-3 shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{entry.author_name}</span>{" "}
                  <span className="text-foreground/85">{entry.body}</span>
                </span>
              </li>
            ))}
        </ul>
      ) : null}

      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t`Reply to this comment`}
        rows={2}
        disabled={busy}
        className="min-h-16 resize-none text-xs"
      />

      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 text-xs" disabled={busy || draft.trim().length === 0} onClick={send}>
          {reply.isPending ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : null}
          <Trans>Reply</Trans>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          disabled={busy}
          onClick={() => resolve.mutate({ id: thread.root.id, resolved: !thread.resolved })}
        >
          {resolve.isPending ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          {thread.resolved ? <Trans>Reopen</Trans> : <Trans>Resolve</Trans>}
        </Button>
      </div>

      {reply.isError || resolve.isError ? (
        <p role="alert" className="text-[11px] leading-4 text-destructive">
          <Trans>That didn't go through. Try again in a moment.</Trans>
        </p>
      ) : null}
    </div>
  )
}
