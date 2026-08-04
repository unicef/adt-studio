import { MoreHorizontal, Move, Pencil, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { cn } from "@/shared/lib/utils"
import { readableTextColor } from "@/features/comments/lib/color"
import { relativeTime } from "@/features/comments/lib/relative-time"
import { COMMENT_BODY_MAX_LENGTH, type PublishComment } from "@/features/comments/lib/contract"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import type { CommentActionResult } from "@/features/comments/hooks/useCommentActions"

type Mode = "read" | "edit" | "confirm"

export interface CommentEntryProps {
  comment: PublishComment
  isSelf: boolean
  indented?: boolean
  /** Own comments only, and only while the link still accepts writes. */
  manageable?: boolean
  /** Present for an anchored root: moving a reply's pin is meaningless. */
  onMove?: () => void
  onEdit?: (body: string) => Promise<CommentActionResult>
  onDelete?: () => Promise<CommentActionResult>
  /** Drives the confirm copy — deleting a root takes its replies with it. */
  replyCount?: number
}

/**
 * One comment in a thread, and the only place a reviewer can change one.
 *
 * The actions live behind a quiet trigger that fades in on hover and on focus
 * but is always in the tab order: a keyboard reviewer must not have to guess
 * that hovering would have revealed something. Delete confirms inline rather
 * than in a modal — the comment being deleted is the thing you need to read
 * while deciding, and a dialog would cover it.
 */
export function CommentEntry({
  comment,
  isSelf,
  indented = false,
  manageable = false,
  onMove,
  onEdit,
  onDelete,
  replyCount = 0,
}: CommentEntryProps) {
  const { t } = useCommentsText()
  const [mode, setMode] = useState<Mode>("read")
  const [draft, setDraft] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)

  const toRead = () => {
    setMode("read")
    setError(null)
    triggerRef.current?.focus()
  }

  const save = async () => {
    const body = draft.trim()
    if (!onEdit || busy) return
    if (!body) {
      setError(t("comments-body-required-label"))
      return
    }
    if (body === comment.body.trim()) {
      toRead()
      return
    }
    setBusy(true)
    setError(null)
    const result = await onEdit(body)
    setBusy(false)
    if (result.ok) toRead()
    else setError(result.message ?? t("comments-update-failed-label"))
  }

  const remove = async () => {
    if (!onDelete || busy) return
    setBusy(true)
    setError(null)
    const result = await onDelete()
    setBusy(false)
    if (!result.ok) {
      setError(result.message ?? t("comments-delete-failed-label"))
      setMode("read")
    }
  }

  return (
    <div className={cn("group/entry flex gap-2", indented && "pl-4")}>
      <span
        aria-hidden
        style={{
          backgroundColor: comment.author_color,
          color: readableTextColor(comment.author_color),
        }}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold uppercase"
      >
        {initialOf(comment.author_name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <p className="flex flex-1 flex-wrap items-baseline gap-1.5">
            <span className="text-xs font-semibold text-foreground">{comment.author_name}</span>
            {isSelf ? (
              <span className="text-[0.65rem] text-muted-foreground">
                ({t("comments-you-label")})
              </span>
            ) : null}
            <span className="text-[0.65rem] text-muted-foreground">
              {relativeTime(comment.created_at, t)}
            </span>
            {comment.edited_at ? (
              <span className="text-[0.65rem] italic text-muted-foreground">
                {t("comments-edited-label")}
              </span>
            ) : null}
          </p>

          {manageable && mode === "read" ? (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger
                ref={triggerRef}
                aria-label={t("comments-actions-label")}
                className={cn(
                  "-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  "text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none",
                  "hover:bg-muted hover:text-foreground focus:outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  "opacity-0 group-hover/entry:opacity-100 group-focus-within/entry:opacity-100",
                  menuOpen && "opacity-100",
                )}
              >
                <MoreHorizontal aria-hidden className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuItem
                  onClick={() => {
                    setDraft(comment.body)
                    setMode("edit")
                    requestAnimationFrame(() => editRef.current?.focus())
                  }}
                >
                  <Pencil aria-hidden className="h-3.5 w-3.5" />
                  {t("comments-edit-label")}
                </DropdownMenuItem>
                {onMove ? (
                  <DropdownMenuItem onClick={onMove}>
                    <Move aria-hidden className="h-3.5 w-3.5" />
                    {t("comments-move-label")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem variant="destructive" onClick={() => setMode("confirm")}>
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  {t("comments-delete-label")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {mode === "edit" ? (
          <div className="mt-1 flex flex-col gap-1.5 duration-150 animate-in fade-in-0 motion-reduce:animate-none">
            <Textarea
              ref={editRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, COMMENT_BODY_MAX_LENGTH))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void save()
                }
                if (event.key === "Escape") {
                  event.stopPropagation()
                  setDraft(comment.body)
                  toRead()
                }
              }}
              maxLength={COMMENT_BODY_MAX_LENGTH}
              rows={3}
              aria-label={t("comments-edit-body-label")}
              className="min-h-16 resize-none text-sm"
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={toRead} disabled={busy}>
                {t("comments-cancel-label")}
              </Button>
              <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
                {busy ? t("comments-sending-label") : t("comments-save-label")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-sm leading-snug whitespace-pre-wrap break-words text-foreground/90">
            {comment.body}
          </p>
        )}

        {mode === "confirm" ? (
          <div
            className={cn(
              "mt-1.5 flex flex-col gap-1.5 rounded-lg bg-destructive/8 p-2",
              "ring-1 ring-destructive/25 duration-150 animate-in fade-in-0 slide-in-from-top-1",
              "motion-reduce:animate-none",
            )}
          >
            <p className="text-xs font-medium text-foreground/85">
              {comment.parent_id === null && replyCount > 0
                ? t("comments-delete-thread-confirm-label")
                : t("comments-delete-confirm-label")}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={toRead} disabled={busy}>
                {t("comments-cancel-label")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void remove()}
                disabled={busy}
              >
                {busy ? t("comments-sending-label") : t("comments-delete-label")}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "?"
}
