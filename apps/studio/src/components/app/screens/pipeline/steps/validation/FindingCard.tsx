import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { ExternalLink } from "lucide-react"
import {
  getAccessibilityCategoryLabel,
  type AccessibilityCategoryKey,
  type FrequentAccessibilityFindingSummary,
} from "@/lib/accessibility-summary"
import { useAxeRuleTranslator } from "@/lib/axe-rule-locale"
import { cn } from "@/lib/utils"
import { FindingPages, type FindingPage } from "./FindingPages"
import type { FindingKind } from "./report"
import { SeverityDot, SeverityLabel } from "./severity"

const TAG = cn(
  "inline-flex h-6 items-center gap-1.5 rounded-full border bg-background px-2 text-[11px] font-medium text-foreground",
  "transition-[background-color,border-color] duration-150 hover:bg-muted motion-reduce:transition-none",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

export function FindingCard({
  finding,
  pageCount,
  pages,
  hex,
  onOpenPage,
  onKind,
  onCategory,
}: {
  finding: FrequentAccessibilityFindingSummary
  pageCount: number
  pages: FindingPage[]
  hex: string
  onOpenPage: (href: string) => void
  onKind: (kind: FindingKind) => void
  onCategory: (category: AccessibilityCategoryKey) => void
}) {
  const { t, i18n } = useLingui()
  const axeRules = useAxeRuleTranslator()
  const review = finding.reviewOnly
  const coverage = Math.round(finding.pageCoverage * 100)
  const count = finding.count

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3.5 animate-in fade-in duration-300 motion-reduce:animate-none">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onKind(review ? "review" : finding.impact)}
          className={cn(TAG, !review && finding.impact === "critical" && "text-red-700 dark:text-red-300")}
          title={review ? t`The checker couldn't decide. Look at this yourself.` : undefined}
        >
          <SeverityDot severity={finding.impact} review={review} />
          {review ? <Trans>To check</Trans> : <SeverityLabel severity={finding.impact} />}
        </button>
        <button type="button" onClick={() => onCategory(finding.categoryKey)} className={cn(TAG, "text-muted-foreground")}>
          {getAccessibilityCategoryLabel(i18n, finding.categoryKey)}
        </button>
        <span className="ml-auto font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {review
            ? t`${plural(count, { one: "# to check", other: "# to check" })}`
            : t`${plural(count, { one: "# problem", other: "# problems" })}`}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[13.5px] font-semibold leading-snug">{axeRules.help(finding.id, finding.help)}</h3>
          {finding.helpUrl ? (
            <a
              href={finding.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t`Learn about the ${finding.id} rule`}
            >
              <code>{finding.id}</code>
              <ExternalLink className="size-3" />
            </a>
          ) : (
            <code className="shrink-0 text-[11px] text-muted-foreground">{finding.id}</code>
          )}
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{axeRules.description(finding.id, finding.description)}</p>
        {review && (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <Trans>The checker couldn't decide on this one. Open the pages below and look for yourself.</Trans>
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={coverage}
          aria-label={t`Share of pages affected`}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.max(4, coverage)}%`, background: hex }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {t`${finding.pagesAffected} of ${plural(pageCount, { one: "# page", other: "# pages" })}`}
        </span>
      </div>

      <FindingPages pages={pages} onOpenPage={onOpenPage} />
    </article>
  )
}
