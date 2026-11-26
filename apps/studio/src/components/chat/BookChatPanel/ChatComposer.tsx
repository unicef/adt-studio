import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ArrowUp, Square } from "lucide-react"
import { CHAT_MESSAGE_MAX_LENGTH } from "@adt/types"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"

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
      className="shrink-0 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <InputGroup className="rounded-xl bg-background">
        <InputGroupTextarea
          value={text}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          disabled={disabled}
          rows={2}
          aria-label={t`Message`}
          placeholder={disabled ? t`Approve or decline the change first` : t`Ask about this book…`}
          className="max-h-40 min-h-[52px] px-3"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <InputGroupAddon align="block-end" className="justify-end">
          {busy ? (
            <InputGroupButton size="icon-sm" variant="outline" className="rounded-full" onClick={onStop} aria-label={t`Stop`}>
              <Square className="size-3.5 fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton type="submit" size="icon-sm" variant="default" className="rounded-full" disabled={disabled || !text.trim()} aria-label={t`Send`}>
              <ArrowUp className="size-4" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
