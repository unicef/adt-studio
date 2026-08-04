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
  COMMENTER_PIN_MAX_LENGTH,
  COMMENTER_PIN_MIN_LENGTH,
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

type Step = "body" | "identity" | "claim"

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
  const [pin, setPin] = useState("")
  const [step, setStep] = useState<Step>(session ? "body" : "identity")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (session && step === "identity") setStep("body")
  }, [session, step])

  useEffect(() => {
    if (!autoFocus) return
    bodyRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (step === "claim") pinRef.current?.focus()
  }, [step])

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
    if (step !== "body") {
      if (!trimmedName) {
        setError(t("comments-name-required-label"))
        nameRef.current?.focus()
        return
      }
      if (pin.length < COMMENTER_PIN_MIN_LENGTH || pin.length > COMMENTER_PIN_MAX_LENGTH) {
        setError(t("comments-pin-required-label"))
        pinRef.current?.focus()
        return
      }
    }

    setBusy(true)
    setError(null)
    try {
      if (step === "identity") {
        try {
          setSession(await context.api.createSession(trimmedName, pin))
        } catch (identityError) {
          if (identityError instanceof CommentsApiError && identityError.code === "name_taken") {
            setStep("claim")
            setPin("")
            setError(null)
            return
          }
          throw identityError
        }
        rememberName(trimmedName)
      } else if (step === "claim") {
        try {
          setSession(await context.api.claimSession(trimmedName, pin))
        } catch (claimError) {
          if (claimError instanceof CommentsApiError && claimError.code === "invalid_claim") {
            setError(t("comments-claim-failed-label"))
            setPin("")
            return
          }
          throw claimError
        }
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
    pin,
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
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
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
            <label className="flex w-28 flex-col gap-1">
              <span className="text-[0.7rem] text-muted-foreground">
                {t("comments-pin-label")}
              </span>
              <Input
                ref={pinRef}
                value={pin}
                onChange={(event) => setPin(digitsOnly(event.target.value))}
                type="password"
                inputMode="numeric"
                maxLength={COMMENTER_PIN_MAX_LENGTH}
                placeholder={t("comments-pin-placeholder")}
                autoComplete="off"
              />
            </label>
          </div>
          <p className="text-[0.7rem] leading-snug text-muted-foreground">
            {t("comments-pin-hint")}
          </p>
        </div>
      ) : null}

      {step === "claim" ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-2.5 duration-200 animate-in fade-in-0 slide-in-from-top-1">
          <p className="text-xs font-medium text-foreground/80">
            {t("comments-name-taken-title", { name: name.trim() })}
          </p>
          <p className="text-[0.7rem] leading-snug text-muted-foreground">
            {t("comments-name-taken-hint", { name: name.trim() })}
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[0.7rem] text-muted-foreground">
              {t("comments-claim-pin-label", { name: name.trim() })}
            </span>
            <Input
              ref={pinRef}
              value={pin}
              onChange={(event) => setPin(digitsOnly(event.target.value))}
              type="password"
              inputMode="numeric"
              maxLength={COMMENTER_PIN_MAX_LENGTH}
              placeholder={t("comments-pin-placeholder")}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="self-start text-[0.7rem] underline underline-offset-2 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setStep("identity")
              setPin("")
              setError(null)
              setName("")
              nameRef.current?.focus()
            }}
          >
            {t("comments-other-name-label")}
          </button>
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
          {busy
            ? t("comments-sending-label")
            : step === "claim"
              ? t("comments-claim-continue-label")
              : t("comments-post-label")}
        </Button>
      </div>
    </form>
  )
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "")
}

export { NAME_STORAGE_KEY }
