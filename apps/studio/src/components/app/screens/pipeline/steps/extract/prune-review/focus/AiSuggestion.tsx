import { useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORY_LABEL } from "../second-opinion/opinionCopy"
import type { Opinion } from "../second-opinion/opinionStore"

const DOT = {
  keep: "bg-emerald-500",
  remove: "bg-zinc-400 dark:bg-zinc-500",
  unsure: "bg-amber-400",
}
const TEXT = {
  keep: "text-emerald-700 dark:text-emerald-300",
  remove: "text-muted-foreground",
  unsure: "text-amber-800 dark:text-amber-300",
}

function languageLabel(code: string, display: string): string {
  try {
    return new Intl.DisplayNames([display], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

export function AiSuggestion({ opinion, compact = false, className }: { opinion: Opinion; compact?: boolean; className?: string }) {
  const { t, i18n } = useLingui()
  const verdict = opinion.verdict === "keep" ? t`AI suggests bringing it back` : opinion.verdict === "remove" ? t`AI agrees it can stay out` : t`AI isn't sure`
  const category = i18n._(CATEGORY_LABEL[opinion.category])
  const otherLanguage = opinion.language && opinion.language.toLowerCase() !== i18n.locale.toLowerCase() ? languageLabel(opinion.language, i18n.locale) : null
  const verdictShort = opinion.verdict === "keep" ? t`bring it back` : opinion.verdict === "remove" ? t`fine to leave out` : t`not sure`
  if (compact)
    return (
      <p className={cn("line-clamp-2 min-w-0 text-[12px] leading-snug", className)} title={opinion.reasoning} data-second-opinion-line>
        <Sparkles className={cn("mr-1 inline size-3.5 align-[-2px]", TEXT[opinion.verdict])} aria-hidden />
        <span className={cn("font-semibold", TEXT[opinion.verdict])}>{t`AI second look:`} {verdictShort}</span>
        <span className="text-muted-foreground" lang={opinion.language}> · {category} · {opinion.reasoning}</span>
        {otherLanguage && <span className="text-muted-foreground"> {t`(in ${otherLanguage})`}</span>}
      </p>
    )
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border bg-card px-3 py-2.5 animate-in fade-in duration-200 motion-reduce:animate-none", className)} data-second-opinion-line={opinion.verdict}>
      <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] leading-snug">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[opinion.verdict])} />
        <span className={cn("font-semibold", TEXT[opinion.verdict])}>{verdict}</span>
        <span className="text-muted-foreground">
          · {category}
          {opinion.confidence ? ` · ${opinion.confidence === "high" ? t`sure` : opinion.confidence === "medium" ? t`fairly sure` : t`not sure`}` : ""}
        </span>
      </p>
      <p className="text-[12px] leading-relaxed text-foreground/80" lang={opinion.language}>
        {opinion.reasoning}
      </p>
      {otherLanguage && <p className="text-[11px] text-muted-foreground">{t`Written in ${otherLanguage}. Use Rewrite in the banner to get it in your language.`}</p>}
    </div>
  )
}
