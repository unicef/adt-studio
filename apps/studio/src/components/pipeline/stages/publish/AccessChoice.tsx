import { useId } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Globe, KeyRound, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  ACCESS_CODE_MAX_LENGTH,
  isValidAccessCode,
  type AccessChoiceValue,
} from "./access-code"

interface AccessChoiceProps {
  value: AccessChoiceValue
  onChange: (value: AccessChoiceValue) => void
  code: string
  onCodeChange: (code: string) => void
  onRegenerate: () => void
  disabled?: boolean
}

/**
 * "Who can open the link?" — the door, chosen before publishing. Radios rather than a switch
 * because both answers are legitimate and the wording is what tells them apart; the code is
 * shown *before* publishing so the author can already write it down or paste it into the
 * message they are about to send.
 */
export function AccessChoice({
  value,
  onChange,
  code,
  onCodeChange,
  onRegenerate,
  disabled = false,
}: AccessChoiceProps) {
  const { t } = useLingui()
  const groupId = useId()
  const name = `${groupId}-access`
  const codeId = `${groupId}-code`
  const hintId = `${groupId}-code-hint`
  const invalid = value === "code" && code.length > 0 && !isValidAccessCode(code)

  const options = [
    {
      value: "code" as const,
      icon: KeyRound,
      title: <Trans>Require an access code</Trans>,
      hint: <Trans>People need the link and a short code you give them.</Trans>,
    },
    {
      value: "open" as const,
      icon: Globe,
      title: <Trans>Anyone with the link</Trans>,
      hint: <Trans>No code. Anybody the link reaches can open the book.</Trans>,
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      <span id={groupId} className="text-sm font-medium text-foreground">
        <Trans>Who can open the link?</Trans>
      </span>
      <div
        role="radiogroup"
        aria-labelledby={groupId}
        data-testid="publish-access-choice"
        className="flex flex-col gap-2"
      >
        {options.map((option) => {
          const selected = option.value === value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-[background-color,border-color,color] duration-200 motion-reduce:transition-none",
                selected
                  ? "border-primary/60 bg-primary/5 text-foreground"
                  : "border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                className="mt-1 size-3.5 shrink-0 accent-primary"
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  {option.title}
                </span>
                <span className="text-xs leading-5 text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          )
        })}
      </div>

      {value === "code" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <label htmlFor={codeId} className="text-xs font-medium text-foreground">
            <Trans>The code people will type</Trans>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={codeId}
              data-testid="publish-access-code-input"
              value={code}
              disabled={disabled}
              maxLength={ACCESS_CODE_MAX_LENGTH}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalid}
              aria-describedby={hintId}
              onChange={(event) => onCodeChange(event.target.value)}
              className="w-40 font-mono text-base tracking-[0.18em] uppercase"
            />
            <Button
              data-testid="publish-access-code-regenerate"
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onRegenerate}
            >
              <RefreshCw aria-hidden="true" />
              <Trans>New code</Trans>
            </Button>
          </div>
          <p id={hintId} className="text-xs leading-5 text-muted-foreground">
            {invalid ? (
              <span data-testid="publish-access-code-invalid" className="text-destructive">
                <Trans>Use 4 to 12 characters, with no spaces.</Trans>
              </span>
            ) : (
              <Trans>
                Keep this one or type your own. You'll see it beside the link afterwards, and you
                can change it whenever you like.
              </Trans>
            )}
          </p>
          <p className="sr-only" aria-live="polite">
            {t`Access code: ${code}`}
          </p>
        </div>
      )}
    </div>
  )
}
