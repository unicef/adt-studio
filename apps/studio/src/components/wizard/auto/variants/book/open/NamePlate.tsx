import { useId } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { PencilLine } from "lucide-react"
import { createProjectLabelSchema } from "@/components/wizard/core/fields/projectLabelSchema"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { useBooks } from "@/hooks/use-books"
import { cn } from "@/lib/utils"

/** Whether the name can be used as the book's folder (the wizard's own rule: slug-safe and unique). */
export function useNameOk() {
  const { data: books } = useBooks()
  return (label: string) => createProjectLabelSchema(books?.map((b: { label: string }) => b.label) ?? []).safeParse(label).success
}

/**
 * The book's name, stamped on a cloth label under the book and editable in place. Same field and
 * validation as the wizard's Project Name (id `wizard-project-name`, so "Create" can focus it).
 */
export function NamePlate({ className }: { className?: string }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const { data: books } = useBooks()
  const existing = books?.map((b: { label: string }) => b.label) ?? []
  const errorId = useId()
  const hintId = useId()
  return (
    <form.Field name="label" validators={{ onChange: createProjectLabelSchema(existing) }}>
      {(field) => {
        const error = field.state.meta.errors[0] as { message?: string } | string | undefined
        const message = typeof error === "string" ? error : error?.message
        return (
          <div className={cn("flex flex-col items-center gap-1.5", className)}>
            <label
              htmlFor="wizard-project-name"
              className={cn(
                "group relative flex h-11 w-[min(360px,100%)] cursor-text items-center gap-2 rounded-[8px] bg-[oklch(0.42_0.13_260)] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.3),0_8px_20px_-12px_rgba(15,23,42,0.6)] ring-1 transition-shadow focus-within:ring-2",
                message ? "ring-destructive focus-within:ring-destructive" : "ring-black/10 focus-within:ring-brand-300",
              )}
            >
              <span aria-hidden className="pointer-events-none absolute inset-[3px] rounded-[6px] border border-dashed border-white/25" />
              <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/60">
                <Trans>Name</Trans>
              </span>
              <input
                id="wizard-project-name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                spellCheck={false}
                autoComplete="off"
                placeholder={t`my-book`}
                aria-invalid={!!message}
                aria-describedby={message ? errorId : hintId}
                className="relative min-w-0 flex-1 bg-transparent font-mono text-[14px] font-semibold tracking-tight text-white outline-none placeholder:text-white/40"
              />
              <PencilLine aria-hidden className="relative size-3.5 shrink-0 text-white/50 transition-colors group-focus-within:text-white" />
            </label>
            {message ? (
              <p id={errorId} role="alert" className="max-w-[360px] text-center text-[12px] leading-snug text-destructive">
                {message}
              </p>
            ) : (
              <p id={hintId} className="text-center text-[12px] text-muted-foreground">
                <Trans>Also the name of the book&apos;s folder.</Trans>
              </p>
            )}
          </div>
        )
      }}
    </form.Field>
  )
}
