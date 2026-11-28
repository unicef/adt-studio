import { useId, type ReactNode } from "react"
import { useLingui } from "@lingui/react"
import { msg } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PROJECT_NAME_INPUT_ID } from "./projectLabelSchema"

function firstFieldErrorMessage(errors: readonly unknown[]): string {
  if (errors.length === 0) return ""
  const raw = errors[0]
  const withMessage = raw as { message?: string } | undefined
  return String(
    withMessage?.message ?? raw,
  )
}

export interface ProjectNameFieldProps {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  errors: readonly unknown[]
  /** Replaces the default hint under the field (the guided flow words it for a first-time user). */
  hint?: ReactNode
  /** Replaces the "Project Name" label (the guided flow calls it the book's name). */
  label?: ReactNode
  /** Enter in the field (the guided flow sets the book up). */
  onEnter?: () => void
}

export function ProjectNameField({
  value,
  onChange,
  onBlur,
  errors,
  hint,
  label,
  onEnter,
}: ProjectNameFieldProps) {
  const { i18n } = useLingui()
  const inputId = PROJECT_NAME_INPUT_ID
  const hintId = useId()
  const errorId = useId()
  const hasError = errors.length > 0
  const errorMessage = firstFieldErrorMessage(errors)

  return (
    <div className="flex flex-col gap-2">
      <Label
        htmlFor={inputId}
        className="cursor-pointer text-sm font-medium text-foreground"
      >
        {label ?? <Trans>Project Name</Trans>} <span className="text-destructive">*</span>
      </Label>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !onEnter || e.nativeEvent.isComposing) return
          e.preventDefault()
          onEnter()
        }}
        placeholder={i18n._(msg`my-book-slug`)}
        className={hasError ? "border-destructive" : ""}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : hintId}
      />
      <div className="grid grid-cols-1">
        <p
          id={hintId}
          aria-hidden={hasError}
          className={cn(
            "col-start-1 row-start-1 text-xs leading-relaxed text-muted-foreground transition-opacity duration-300 ease-out",
            hasError ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          {hint ?? <Trans>A unique identifier used as the book folder name.</Trans>}
        </p>
        <p
          id={errorId}
          role={hasError ? "alert" : undefined}
          aria-hidden={!hasError}
          className={cn(
            "col-start-1 row-start-1 text-xs leading-relaxed text-destructive transition-opacity duration-300 ease-out",
            hasError ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {errorMessage || "\u00a0"}
        </p>
      </div>
    </div>
  )
}
