import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AUTHOR_NAME_MAX_LENGTH, type AuthorIdentity } from "@/hooks/use-publication-feedback"

/**
 * "Replying as <name> — change". The worker renames every comment the author has already
 * written when a new name arrives (§4.10), so this is a single field with no migration and no
 * confirmation step to design.
 */
export function AuthorNameField({
  identity,
  showPrompt = false,
}: {
  identity: AuthorIdentity
  /** The one-time nudge, raised by the view the first time the author replies. */
  showPrompt?: boolean
}) {
  const { t } = useLingui()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(identity.displayName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const visible = showPrompt && identity.needsNamePrompt
  const { dismissNamePrompt } = identity
  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(dismissNamePrompt, 15_000)
    return () => window.clearTimeout(timer)
  }, [dismissNamePrompt, visible])

  const save = () => {
    identity.setAuthorName(draft)
    identity.dismissNamePrompt()
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 border-b bg-muted/30 px-3 py-2">
        <Input
          ref={inputRef}
          value={draft}
          maxLength={AUTHOR_NAME_MAX_LENGTH}
          aria-label={t`Your name on replies`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save()
            if (event.key === "Escape") {
              setDraft(identity.displayName)
              setEditing(false)
            }
          }}
          className="h-7 text-xs"
        />
        <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={save}>
          <Trans>Save</Trans>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setDraft(identity.displayName)
            setEditing(false)
          }}
        >
          <Trans>Cancel</Trans>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 border-b bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">
        <Trans>
          Replying as <span className="font-semibold text-foreground">{identity.displayName}</span>
        </Trans>{" "}
        <button
          type="button"
          onClick={() => {
            setDraft(identity.displayName)
            setEditing(true)
          }}
          className="cursor-pointer underline underline-offset-2 transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
        >
          <Trans>change</Trans>
        </button>
      </p>
      {visible ? (
        <p className="text-[10px] text-muted-foreground/80 duration-200 animate-in fade-in motion-reduce:animate-none">
          <Trans>
            Reviewers will see this name on your replies. You can change it any time — past
            replies are relabelled too.
          </Trans>
        </p>
      ) : null}
    </div>
  )
}
