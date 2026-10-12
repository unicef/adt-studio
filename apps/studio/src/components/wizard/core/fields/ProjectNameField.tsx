import { useId } from "react"
import { useLingui } from "@lingui/react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
}

export function ProjectNameField({
  value,
  onChange,
  onBlur,
  errors,
}: ProjectNameFieldProps) {
  const { i18n } = useLingui()
  const inputId = "wizard-project-name"
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
        <Trans>Project Name</Trans> <span className="text-destructive">*</span>
      </Label>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={i18n._(t`my-book-slug`)}
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
          <Trans>A unique identifier used as the book folder name.</Trans>
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
