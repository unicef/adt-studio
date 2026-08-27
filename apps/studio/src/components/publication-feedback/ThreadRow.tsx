import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, CircleSlash, Loader2, MapPin, Pencil, Reply, Trash2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { PublishComment } from "@/api/client"
import { RelativeTime } from "./RelativeTime"
import { readableTextColor, snippet, type FeedbackThread } from "./lib/threads"

export interface ThreadRowProps {
  thread: FeedbackThread
  pinNumber: number | undefined
  currentVersion: number
  /** The anchor did not resolve in the framed snapshot, so no pin is drawn for it. */
  pinMissing: boolean
  expanded: boolean
  authorSessionId: string | null
  onSelect: () => void
  onReply: (body: string) => Promise<void>
  onResolve: (resolved: boolean) => Promise<void>
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  busy: boolean
}

export function ThreadRow({
  thread,
  pinNumber,
  currentVersion,
  pinMissing,
  expanded,
  authorSessionId,
  onSelect,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  busy,
}: ThreadRowProps) {
  const { t } = useLingui()
  const detailId = `feedback-thread-${thread.root.id}`
  const root = thread.root
  const color = root.author_color
  const isOwn = authorSessionId !== null && root.session_id === authorSessionId
  const deleted = root.deleted_at !== null
  const staleVersion = root.version !== currentVersion

  return (
    <li
      className={cn(
        "rounded-lg border transition-colors duration-200 motion-reduce:transition-none",
        expanded ? "border-indigo-300 bg-indigo-50/40" : "border-transparent hover:bg-muted/50",
        thread.resolved && !expanded ? "opacity-70" : null,
      )}
    >
      <button
        type="button"
        data-thread-row
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onSelect}
        className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <span
          aria-hidden
          data-testid="thread-pin-marker"
          style={{
            backgroundColor: thread.resolved ? "#ffffff" : color,
            color: thread.resolved ? color : readableTextColor(color),
            borderColor: color,
          }}
          className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full rounded-bl-none border px-1 text-[10px] font-semibold"
        >
          {root.anchor === null ? "•" : pinMissing ? "–" : (pinNumber ?? "?")}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-semibold">{root.author_name}</span>
            <RelativeTime iso={root.created_at} className="text-[10px] text-muted-foreground" />
            {staleVersion ? (
              <span
                title={t`Written on version ${root.version} of this book`}
                className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800"
              >
                {t`v${root.version}`}
              </span>
            ) : null}
            {root.anchor === null ? (
              <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                <Trans>Whole page</Trans>
              </span>
            ) : pinMissing ? (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                <CircleSlash className="h-2.5 w-2.5" aria-hidden />
                <Trans>Pin not on this version</Trans>
              </span>
            ) : null}
            {thread.resolved ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800">
                <Check className="h-2.5 w-2.5" aria-hidden />
                <Trans>Resolved</Trans>
              </span>
            ) : null}
          </span>

          {/* The open thread prints the whole comment below, so the snippet would only
              repeat it. */}
          {expanded ? null : (
            <span
              className={cn(
                "line-clamp-2 text-xs leading-snug",
                deleted ? "italic text-muted-foreground" : "text-foreground/90",
              )}
            >
              {deleted ? t`This comment was deleted` : snippet(root.body)}
            </span>
          )}

          {thread.replyCount > 0 && !expanded ? (
            <span className="text-[10px] text-muted-foreground">
              {thread.replyCount === 1
                ? t`1 reply`
                : t`${thread.replyCount} replies`}
            </span>
          ) : null}
        </span>
      </button>

      {expanded ? (
        <ThreadDetail
          id={detailId}
          thread={thread}
          authorSessionId={authorSessionId}
          rootIsOwn={isOwn}
          onReply={onReply}
          onResolve={onResolve}
          onEdit={onEdit}
          onDelete={onDelete}
          busy={busy}
        />
      ) : null}
    </li>
  )
}

function ThreadDetail({
  id,
  thread,
  authorSessionId,
  rootIsOwn,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  busy,
}: {
  id: string
  thread: FeedbackThread
  authorSessionId: string | null
  rootIsOwn: boolean
  onReply: (body: string) => Promise<void>
  onResolve: (resolved: boolean) => Promise<void>
  onEdit: (commentId: string, body: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  busy: boolean
}) {
  const { t } = useLingui()
  const [replyBody, setReplyBody] = useState("")
  const replyRef = useRef<HTMLTextAreaElement>(null)

  const submitReply = async () => {
    const body = replyBody.trim()
    if (body.length === 0) return
    await onReply(body)
    setReplyBody("")
    replyRef.current?.focus()
  }

  return (
    <div
      id={id}
      className="flex flex-col gap-2 border-t border-indigo-100 px-2 pb-2 pt-2 duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
    >
      <CommentBody
        comment={thread.root}
        isOwn={rootIsOwn}
        onEdit={onEdit}
        onDelete={onDelete}
        busy={busy}
      />

      {thread.replies.length > 0 ? (
        <ul className="flex flex-col gap-2 border-l-2 border-indigo-100 pl-2">
          {thread.replies.map((reply) => (
            <li key={reply.id}>
              <CommentBody
                comment={reply}
                isOwn={authorSessionId !== null && reply.session_id === authorSessionId}
                onEdit={onEdit}
                onDelete={onDelete}
                busy={busy}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <Textarea
        ref={replyRef}
        value={replyBody}
        onChange={(event) => setReplyBody(event.target.value)}
        rows={2}
        aria-label={t`Reply to this thread`}
        placeholder={t`Reply…`}
        className="min-h-16 text-xs"
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || replyBody.trim().length === 0}
          onClick={() => void submitReply()}
          className="h-7 gap-1 px-2 text-xs"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Reply className="h-3 w-3" aria-hidden />
          )}
          <Trans>Reply</Trans>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={thread.resolved ? "outline" : "secondary"}
          disabled={busy}
          onClick={() => void onResolve(!thread.resolved)}
          className="h-7 gap-1 px-2 text-xs"
        >
          {thread.resolved ? (
            <Undo2 className="h-3 w-3" aria-hidden />
          ) : (
            <Check className="h-3 w-3" aria-hidden />
          )}
          {thread.resolved ? <Trans>Reopen</Trans> : <Trans>Resolve</Trans>}
        </Button>

        {thread.root.anchor === null ? null : (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="h-2.5 w-2.5" aria-hidden />
            <Trans>Pinned</Trans>
          </span>
        )}
      </div>
    </div>
  )
}

function CommentBody({
  comment,
  isOwn,
  onEdit,
  onDelete,
  busy,
}: {
  comment: PublishComment
  isOwn: boolean
  onEdit: (commentId: string, body: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  busy: boolean
}) {
  const { t } = useLingui()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

  if (comment.deleted_at !== null) {
    return (
      <p className="rounded bg-muted/60 px-2 py-1 text-xs italic text-muted-foreground">
        <Trans>This comment was deleted</Trans>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: comment.author_color }}
        />
        <span className="truncate text-xs font-semibold">{comment.author_name}</span>
        <RelativeTime iso={comment.created_at} className="text-[10px] text-muted-foreground" />
        {comment.edited_at !== null ? (
          <span className="text-[10px] text-muted-foreground">
            <Trans>edited</Trans>
          </span>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-1">
          <Textarea
            ref={editRef}
            value={draft}
            rows={2}
            aria-label={t`Edit your comment`}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-16 text-xs"
          />
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={busy || draft.trim().length === 0}
              onClick={() => {
                void onEdit(comment.id, draft.trim()).then(() => setEditing(false))
              }}
            >
              <Trans>Save</Trans>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setDraft(comment.body)
                setEditing(false)
              }}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-xs leading-snug text-foreground/90">
          {comment.body}
        </p>
      )}

      {isOwn && !editing ? (
        confirmingDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">
              <Trans>Delete this comment?</Trans>
            </span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-xs"
              disabled={busy}
              onClick={() => {
                void onDelete(comment.id).then(() => setConfirmingDelete(false))
              }}
            >
              <Trans>Delete</Trans>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setConfirmingDelete(false)}
            >
              <Trans>Keep</Trans>
            </Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-2.5 w-2.5" aria-hidden />
              <Trans>Edit</Trans>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[10px] text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-2.5 w-2.5" aria-hidden />
              <Trans>Delete</Trans>
            </Button>
          </div>
        )
      ) : null}
    </div>
  )
}
