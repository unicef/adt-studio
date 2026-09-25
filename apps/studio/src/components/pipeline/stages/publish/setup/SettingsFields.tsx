import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Globe, KeyRound, RefreshCw } from "lucide-react"
import { STAGES, type StageDefinition } from "@/components/pipeline/stage-config"
import { BrandedSwitch } from "@/components/ui/branded-switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"
import { ACCESS_CODE_MAX_LENGTH } from "../access-code"
import type { ExpiryChoiceValue } from "../expiry-options"
import type { IncludeKey, ShareForm } from "./useShareForm"

/** Each part of the book is the output of a pipeline stage, so it wears that stage's icon and
 *  colour — the author has already learned them from the sidebar. */
const INCLUDE_STAGE: Record<IncludeKey, StageDefinition["slug"]> = {
  readAloud: "speech",
  quizzes: "quizzes",
  glossary: "glossary",
  signLanguage: "sign-language",
}

export function includeStage(key: IncludeKey): StageDefinition {
  return STAGES.find((stage) => stage.slug === INCLUDE_STAGE[key]) as StageDefinition
}

const ACCENT = "var(--accent-color, var(--primary))"

function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 flex w-full items-baseline justify-between gap-3 text-sm font-medium text-foreground">
        {label}
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </legend>
      {children}
    </fieldset>
  )
}

/**
 * The three questions, every answer already chosen. The defaults — a code, no end date, the whole
 * book — are the right ones for nearly every author, so most never touch this panel.
 *
 * The inputs are the Studio's own: one-of-several choices are the segmented control every stage
 * uses for its settings, and parts of the book are switches, the way every stage turns a feature
 * on or off. Nothing here should look like a control the author has to learn.
 */
export function SettingsFields({ form, disabled = false }: { form: ShareForm; disabled?: boolean }) {
  const { t } = useLingui()
  const expiryLabel: Record<ExpiryChoiceValue, string> = {
    "7": t`7 days`,
    "30": t`30 days`,
    "90": t`90 days`,
    never: t`Never`,
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-5 transition-opacity duration-300 motion-reduce:transition-none",
        disabled && "pointer-events-none opacity-45",
      )}
      aria-disabled={disabled || undefined}
      inert={disabled || undefined}
    >
      <Field label={<Trans>Who can open it</Trans>}>
        <SegmentedControl
          value={form.access}
          onValueChange={form.setAccess}
          options={[
            { value: "code", label: t`With a code`, icon: <KeyRound className="size-3.5" /> },
            { value: "open", label: t`Anyone with the link`, icon: <Globe className="size-3.5" /> },
          ]}
        />

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
            form.access === "code" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 pt-0.5">
              <Input
                value={form.code}
                maxLength={ACCESS_CODE_MAX_LENGTH}
                onChange={(event) => form.setCode(event.target.value)}
                data-testid="publish-access-code-input"
                aria-label={t`Access code`}
                aria-invalid={!form.codeValid}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled || form.access !== "code"}
                className="h-9 flex-1 font-mono text-base uppercase tracking-[0.24em]"
              />
              <Button
                data-testid="publish-access-code-regenerate"
                type="button"
                variant="outline"
                className="h-9"
                disabled={disabled || form.access !== "code"}
                onClick={form.regenerate}
              >
                <RefreshCw aria-hidden="true" />
                <Trans>New code</Trans>
              </Button>
            </div>
            {form.codeValid ? null : (
              <p
                data-testid="publish-access-code-invalid"
                className="px-0.5 pt-1.5 text-xs leading-5 text-destructive motion-safe:animate-in motion-safe:fade-in-0"
              >
                <Trans>Use 4 to 12 characters, with no spaces.</Trans>
              </p>
            )}
          </div>
        </div>
      </Field>

      <Field label={<Trans>Link expires</Trans>} hint={<Trans>You can stop it any time</Trans>}>
        <SegmentedControl
          value={form.expiry}
          onValueChange={form.setExpiry}
          options={form.expiryOptions.map((value) => ({ value, label: expiryLabel[value] }))}
        />
      </Field>

      {form.includeRows.length === 0 ? null : (
      <Field
        label={<Trans>What to include</Trans>}
        hint={
          form.includedCount < form.includeRows.length ? (
            <Trans>Left out of the shared copy only</Trans>
          ) : null
        }
      >
        <ul className="flex list-none flex-col divide-y overflow-hidden rounded-lg border p-0">
          {form.includeRows.map((row) => {
            const stage = includeStage(row.key)
            const Icon = stage.icon
            const on = form.include[row.key]
            const id = `share-include-${row.key}`
            return (
              <li key={row.key} className="flex h-10 items-center gap-2.5 bg-white pl-2 pr-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
                    on ? cn(stage.color, "text-white") : "bg-muted text-muted-foreground/60",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <label
                  htmlFor={id}
                  className={cn(
                    "min-w-0 flex-1 cursor-pointer truncate text-sm transition-colors duration-200",
                    on ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {row.label}
                </label>
                {row.heavy ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Trans>Large</Trans>
                  </span>
                ) : null}
                <BrandedSwitch
                  id={id}
                  color={ACCENT}
                  checked={on}
                  onCheckedChange={() => form.toggleInclude(row.key)}
                  disabled={disabled}
                  className="h-5 w-9 [&>span]:size-4 [&>span]:data-[state=checked]:translate-x-4"
                />
              </li>
            )
          })}
        </ul>
      </Field>
      )}
    </div>
  )
}
