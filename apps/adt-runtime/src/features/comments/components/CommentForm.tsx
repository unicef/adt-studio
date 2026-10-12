import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { cn } from "@/shared/lib/utils"
import { CommentsApiError } from "@/features/comments/lib/api"
import type { CommentAnchor } from "@/features/comments/lib/anchor"
import {
  COMMENT_BODY_MAX_LENGTH,
  COMMENTER_NAME_MAX_LENGTH,
  type PublishComment,
} from "@/features/comments/lib/contract"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import {
  commentModeAtom,
  commentsSessionAtom,
  commentsStatusAtom,
  rememberedNameAtom,
} from "@/features/comments/state/comments.atoms"

const NAME_STORAGE_KEY = "commentAuthorName"

/** M3.5: two steps, not three. The access code on the door is what tells strangers apart from
 *  invited readers now, so a name is just a label — no PIN to choose, nothing to claim. */
type Step = "body" | "identity"

export interface CommentFormProps {
  context: CommentsRuntimeContext
  pageSectionId: string
  anchor?: CommentAnchor | null
  parentId?: string | null
  autoFocus?: boolean
  compact?: boolean
  onPosted: (comment: PublishComment) => void
  onCancel?: () => void
}

/**
 * The one place a comment is written — used both for a new pin's composer and
 * for a reply inside a thread. It owns the whole identity path, because the
 * moment a reviewer needs a name is the moment they have already typed
 * something they do not want to lose.
 */
export function CommentForm({
  context,
  pageSectionId,
  anchor = null,
  parentId = null,
  autoFocus = false,
  compact = false,
  onPosted,
  onCancel,
}: CommentFormProps) {
  const { t } = useCommentsText()
  const session = useAtomValue(commentsSessionAtom)
  const setSession = useSetAtom(commentsSessionAtom)
  const setStatus = useSetAtom(commentsStatusAtom)
  const setCommentMode = useSetAtom(commentModeAtom)
  const rememberedName = useAtomValue(rememberedNameAtom)
  const setRememberedName = useSetAtom(rememberedNameAtom)

  const [body, setBody] = useState("")
  const [name, setName] = useState(rememberedName)
  const [step, setStep] = useState<Step>(session ? "body" : "identity")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (session && step === "identity") setStep("body")
  }, [session, step])

  useEffect(() => {
    if (!autoFocus) return
    bodyRef.current?.focus()
  }, [autoFocus])

  const rememberName = useCallback(
    (value: string) => {
      setRememberedName(value)
      try {
        window.localStorage.setItem(NAME_STORAGE_KEY, value)
      } catch {
        /* private-mode storage refusal must not block commenting */
      }
    },
    [setRememberedName],
  )

  const post = useCallback(async () => {
    const trimmedBody = body.trim()
    if (!trimmedBody) {
      setError(t("comments-body-required-label"))
      bodyRef.current?.focus()
      return
    }
    if (trimmedBody.length > COMMENT_BODY_MAX_LENGTH) {
      setError(t("comments-body-too-long-label", { max: String(COMMENT_BODY_MAX_LENGTH) }))
      return
    }

    const trimmedName = name.trim()
    if (step === "identity" && !trimmedName) {
      setError(t("comments-name-required-label"))
      nameRef.current?.focus()
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (step === "identity") {
        setSession(await context.api.createSession(trimmedName))
        rememberName(trimmedName)
      }

      const comment = await context.api.createComment({
        pageSectionId,
        body: trimmedBody,
        anchor: parentId ? undefined : anchor,
        parentId,
      })
      setBody("")
      setStep("body")
      onPosted(comment)
    } catch (postError) {
      if (postError instanceof CommentsApiError) {
        if (postError.isGone) {
          setStatus("gone")
          setCommentMode(false)
          setError(t("comments-gone-label"))
          return
        }
        if (postError.needsIdentity) {
          setSession(null)
          setStep("identity")
          setError(null)
          return
        }
        if (postError.code === "payload_too_large") {
          setError(t("comments-body-too-long-label", { max: String(COMMENT_BODY_MAX_LENGTH) }))
          return
        }
      }
      setError(t("comments-failed-label"))
    } finally {
      setBusy(false)
    }
  }, [
    anchor,
    body,
    context.api,
    name,
    onPosted,
    pageSectionId,
    parentId,
    rememberName,
    setCommentMode,
    setSession,
    setStatus,
    step,
    t,
  ])

  const onBodyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void post()
    }
  }

  const remaining = COMMENT_BODY_MAX_LENGTH - body.length

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void post()
      }}
    >
      <Textarea
        ref={bodyRef}
        value={body}
        onChange={(event) => setBody(event.target.value.slice(0, COMMENT_BODY_MAX_LENGTH))}
        onKeyDown={onBodyKeyDown}
        maxLength={COMMENT_BODY_MAX_LENGTH}
        rows={compact ? 2 : 3}
        placeholder={
          parentId ? t("comments-reply-placeholder") : t("comments-body-placeholder")
        }
        aria-label={parentId ? t("comments-reply-placeholder") : t("comments-body-placeholder")}
        className={cn("resize-none text-sm", compact ? "min-h-14" : "min-h-20")}
      />

      {step === "identity" ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-2.5 duration-200 animate-in fade-in-0 slide-in-from-top-1">
          <p className="text-xs font-medium text-foreground/80">
            {t("comments-identity-intro")}
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[0.7rem] text-muted-foreground">
              {t("comments-name-label")}
            </span>
            <Input
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={COMMENTER_NAME_MAX_LENGTH}
              placeholder={t("comments-name-placeholder")}
              autoComplete="off"
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive duration-150 animate-in fade-in-0">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {remaining < 200 ? (
          <span className="mr-auto text-[0.7rem] text-muted-foreground">{remaining}</span>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t("comments-cancel-label")}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? t("comments-sending-label") : t("comments-post-label")}
        </Button>
      </div>
    </form>
  )
}

export { NAME_STORAGE_KEY }
