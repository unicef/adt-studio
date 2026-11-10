import { useCallback, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Languages, Loader2, RotateCcw } from "lucide-react"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { FilteredImage } from "../useFilteredImages"
import type { SecondOpinionApi } from "./useSecondOpinion"
import { useCloseOnScroll } from "../useCloseOnScroll"

function isRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const keptStore = createPersistentStore<Record<string, string>>("adt.extract.left-out.language-ok", {}, isRecord)

function useKeptLanguage(label: string): [string | null, (language: string) => void] {
  const [all, setAll] = keptStore.use()
  const keep = useCallback((language: string) => setAll((previous) => ({ ...previous, [label]: language })), [label, setAll])
  return [all[label] ?? null, keep]
}

function languageName(code: string, display: string): string {
  try {
    const name = new Intl.DisplayNames([display], { type: "language" }).of(code) ?? code
    return name.charAt(0).toLocaleUpperCase(display) + name.slice(1)
  } catch {
    return code
  }
}

export function staleAnswers(opinion: SecondOpinionApi, scope: readonly FilteredImage[]) {
  const stale = scope.filter((item) => {
    const answer = opinion.opinionOf(item)
    return !!answer?.language && answer.language.toLowerCase() !== opinion.locale.toLowerCase()
  })
  const first = stale[0] ? opinion.opinionOf(stale[0]) : null
  return { stale, language: first?.language ?? null, sample: first?.reasoning ?? null }
}

export function LanguageNotice({ label, opinion, scope, className, hex }: { label: string; opinion: SecondOpinionApi; scope: readonly FilteredImage[]; className?: string; hex?: string }) {
  const { t } = useLingui()
  const [kept, keep] = useKeptLanguage(label)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useCloseOnScroll(open, close)
  const { stale, language, sample } = staleAnswers(opinion, scope)
  if (!language || stale.length === 0 || kept === `${language}>${opinion.locale}`) return null
  const then = languageName(language, opinion.locale)
  const now = languageName(opinion.locale, opinion.locale)
  const paint = (node: HTMLElement | null) => {
    if (node && hex) node.style.setProperty("--chrome-hex", hex)
  }
  const tip = t`The AI answers are in ${then}`
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tip}
          title={tip}
          className={cn(
            "relative grid size-9 shrink-0 place-items-center rounded-lg border bg-card text-foreground transition-colors duration-150 hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
            className,
          )}
          data-ai-language-notice
        >
          <Languages className="size-4" aria-hidden />
          <span aria-hidden className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950 ring-2 ring-card motion-safe:animate-in motion-safe:zoom-in-50">
            !
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent ref={paint} align="end" sideOffset={8} className="w-[24rem] p-0" data-ai-language-popover>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-400/20 text-amber-800 dark:text-amber-300">
              <Languages className="size-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[13.5px] font-semibold">{tip}</p>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {t`${plural(stale.length, { one: "# answer was written before Studio switched to", other: "# answers were written before Studio switched to" })} ${now}.`}{" "}
                <Trans>The verdicts stay the same; only the explanations change.</Trans>
              </p>
            </div>
          </div>
          {sample && (
            <blockquote className="line-clamp-3 rounded-md bg-muted/60 px-2.5 py-1.5 text-[12px] leading-snug text-foreground/75 italic" lang={language}>
              {sample}
            </blockquote>
          )}
        </div>
        <div className="flex items-center gap-1.5 border-t bg-muted/30 px-4 py-3">
          <button
            type="button"
            onClick={() => keep(`${language}>${opinion.locale}`)}
            className="flex h-8 items-center rounded-lg px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <Trans>Keep {then}</Trans>
          </button>
          <button
            type="button"
            onClick={() => void opinion.ask(stale, true)}
            disabled={opinion.running}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-[var(--chrome-hex)] px-3 text-[12.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
            data-language-ask
          >
            {opinion.running ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />}
            <Trans>Rewrite in {now}</Trans>
          </button>
        </div>
        <p className="px-4 pb-3 text-[11.5px] text-muted-foreground bg-muted/30">{t`About a minute; you can keep working.`}</p>
      </PopoverContent>
    </Popover>
  )
}
