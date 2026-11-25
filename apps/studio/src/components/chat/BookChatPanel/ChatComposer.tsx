import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { CHAT_MESSAGE_MAX_LENGTH } from "@adt/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ChatComposerProps {
  busy: boolean
  disabled: boolean
  onSend: (text: string) => void
  onStop: () => void
}

export function ChatComposer({ busy, disabled, onSend, onStop }: ChatComposerProps) {
  const { t } = useLingui()
  const [text, setText] = useState("")

  const submit = () => {
    const value = text.trim()
    if (!value || busy || disabled) return
    onSend(value)
    setText("")
  }

  return (
    <form
      className="flex flex-col gap-2 border-t border-border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Textarea
        value={text}
        maxLength={CHAT_MESSAGE_MAX_LENGTH}
        disabled={disabled}
        rows={3}
        aria-label={t`Message`}
        placeholder={t`Ask about this book…`}
        className="min-h-[72px] resize-none"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className="flex justify-end">
        {busy ? (
          <Button type="button" size="sm" variant="outline" onClick={onStop}>
            <Trans>Stop</Trans>
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={disabled || !text.trim()}>
            <Trans>Send</Trans>
          </Button>
        )}
      </div>
    </form>
  )
}
