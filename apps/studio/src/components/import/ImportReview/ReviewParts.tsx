import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, Check as CheckIcon, Minus, X } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { cn } from "@/lib/utils"
import { FEATURES, featureStatus } from "./helpers"
import type { Check, CheckState, Status, Step, Tone } from "./use-review-model"


export function Panel({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-card p-4 [@media(max-height:960px)]:gap-1.5 [@media(max-height:960px)]:p-3", className)}>
      {title ? <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</h3> : null}
      {children}
    </section>
  )
}

const TONE_CLASSNAMES: Record<Tone, string> = {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Tailwind classes, not user-visible copy.
  green: "bg-muted [&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-400",
  amber: "bg-amber-500/10 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400",
  red: "bg-destructive/10 [&_svg]:text-destructive",
  blue: "bg-brand-500/10 [&_svg]:text-brand-600 dark:[&_svg]:text-brand-400",
}

export function StatusRow({ status, children }: { status: Status; children?: ReactNode }) {
  const Icon = status.icon
  return (
    <div className={cn("flex shrink-0 items-start gap-3 rounded-lg px-3.5 py-3", TONE_CLASSNAMES[status.tone])}>
      <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{status.title}</p>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground text-pretty">{status.text}</p>
        {children}
      </div>
    </div>
  )
}

const CHECK_STYLE: Record<CheckState, { dot: string; value: string; icon: typeof CheckIcon }> = {
  ok: { dot: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", value: "text-muted-foreground", icon: CheckIcon },
  bad: { dot: "bg-destructive/10 text-destructive", value: "text-destructive", icon: X },
  warn: { dot: "bg-amber-500/15 text-amber-600 dark:text-amber-400", value: "text-amber-700 dark:text-amber-400", icon: AlertCircle },
  off: { dot: "bg-muted text-muted-foreground", value: "text-muted-foreground", icon: Minus },
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col">
      {checks.map((check) => {
        const style = CHECK_STYLE[check.state]
        const Dot = style.icon
        const Icon = check.icon
        return (
          <li key={check.label} className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0 [@media(max-height:960px)]:py-1.5">
            <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-full", style.dot)}>
              <Dot aria-hidden="true" className="size-3" />
            </span>
            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-[13.5px] text-foreground">{check.label}</span>
            <span className={cn("text-right text-[13px] tabular-nums", style.value)}>{check.value}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-3 [@media(max-height:960px)]:gap-2">
      {steps.map((step, index) => (
        <li key={step.title} className="flex items-start gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-brand-200 bg-brand-500/10 text-[11px] font-semibold tabular-nums text-brand-600 dark:border-brand-800 dark:text-brand-400">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-foreground">{step.title}</span>
            <span className="block text-[12.5px] text-muted-foreground">{step.text}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function FeaturesSummary({ preview }: { preview: AnyImportPreview }) {
  const { i18n } = useLingui()
  const withStatus = FEATURES.map((feature) => ({ feature, status: featureStatus(preview, feature.slug) }))
  const included = withStatus.filter((entry) => entry.status === "recovered")
  const regenerate = withStatus.filter((entry) => entry.status === "needs-regeneration")
  const available = withStatus.filter((entry) => entry.status === "available")
  const availableCount = available.length

  return (
    <>
      {[...included, ...regenerate].map(({ feature, status }) => {
        const Icon = feature.icon
        const recovered = status === "recovered"
        return (
          <div key={feature.slug} className="flex items-start gap-3 border-b border-border py-2 last:border-b-0">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-lg"
              style={recovered ? { backgroundColor: `${feature.hex}1f`, color: feature.hex } : undefined}
            >
              <Icon aria-hidden="true" className={cn("size-4", !recovered && "text-amber-600 dark:text-amber-400")} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-foreground">{i18n._(feature.label)}</span>
              <span className="block text-[12.5px] text-muted-foreground">
                {recovered ? i18n._(feature.description) : <Trans>The publication uses this, but its editable data isn’t in the archive.</Trans>}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                recovered ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              {recovered ? <Trans>Included</Trans> : <Trans>Generate again</Trans>}
            </span>
          </div>
        )
      })}
      {availableCount > 0 ? (
        <>
          <p className="text-[12.5px] text-muted-foreground">
            {included.length + regenerate.length > 0
              ? <Trans>{availableCount} more you can generate after import:</Trans>
              : <Trans>You can generate these after import:</Trans>}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {available.map(({ feature }) => {
              const Icon = feature.icon
              return (
                <li key={feature.slug} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  <Icon aria-hidden="true" className="size-3" />
                  {i18n._(feature.label)}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </>
  )
}

export function FactList({ facts }: { facts: Array<{ label: string; value: string }> }) {
  return (
    <dl className="flex flex-col">
      {facts.map((fact) => (
        <div key={fact.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 border-b border-border py-2 text-[13.5px] last:border-b-0">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
