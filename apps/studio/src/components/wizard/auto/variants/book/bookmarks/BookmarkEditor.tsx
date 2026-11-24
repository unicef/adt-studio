import { useId } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Lock, RotateCcw, Sparkles, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { RULE_WHY, SETTING_NAME } from "../../../engine/words"
import type { BookSetting, SettingValue } from "../model"
import { useSettingWords } from "../useBookState"
import { FACT_TOPIC } from "../words"
import { SourceMark } from "./SourceMark"

/** What a bookmark opens: why the AI picked it, every value in the wizard's words, and the pages behind it. */
export function BookmarkEditor({ setting, onChange, onShowPages }: { setting: BookSetting; onChange: (value: SettingValue) => void; onShowPages: (page: number) => void }) {
  const { i18n } = useLingui()
  const words = useSettingWords()
  const name = useId()
  const why = RULE_WHY[setting.rule]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-[-0.01em]">{words.name(setting.id)}</p>
          <p className="text-[12px] text-muted-foreground">{i18n._(SETTING_NAME[setting.id])}</p>
        </div>
        <SourceMark source={setting.source} withText />
      </div>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {setting.source === "changed" ? (
          <Trans>You changed this. The notes point to {words.value(setting.id, setting.base)}.</Trans>
        ) : setting.source === "answered" ? (
          <>
            <Trans>Follows your answer on the notes.</Trans> {why && i18n._(why)}
          </>
        ) : (
          why && i18n._(why)
        )}
      </p>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">{words.name(setting.id)}</legend>
        {setting.options.map((option) => {
          const checked = option === setting.value
          return (
            <label
              key={String(option)}
              className={cn(
                "group relative flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 transition-[border-color,background-color] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400/60",
                checked ? "border-brand-400 bg-brand-50/70 dark:bg-brand-500/10" : "border-border hover:border-brand-300 hover:bg-muted/40",
              )}
            >
              <input type="radio" name={name} className="sr-only" checked={checked} onChange={() => onChange(option)} />
              <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors", checked ? "border-brand-600" : "border-muted-foreground/40")}>
                  <span className={cn("size-1.5 rounded-full bg-brand-600 transition-transform duration-150", checked ? "scale-100" : "scale-0")} />
                </span>
                {words.value(setting.id, option)}
                {option === setting.ai ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700">
                    <Sparkles className="size-3" />
                    <Trans>AI pick</Trans>
                  </span>
                ) : option === setting.base ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <UserRound className="size-3" />
                    <Trans>Your answer</Trans>
                  </span>
                ) : null}
              </span>
              <span className="pl-6 text-[12px] leading-snug text-muted-foreground">{words.means(setting.id, option)}</span>
            </label>
          )
        })}
      </fieldset>

      {setting.dependsOn.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          <Trans>Moves with the note on: {setting.dependsOn.map((f) => i18n._(FACT_TOPIC[f])).join(", ")}</Trans>
        </p>
      )}
      {setting.locked && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <Trans>Fixed once the book is created: this one can&apos;t be changed later.</Trans>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {setting.pages.length > 0 && (
          <button type="button" onClick={() => onShowPages(setting.pages[0]!)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-[12.5px] font-semibold transition-colors hover:bg-muted/70">
            <BookOpen className="size-3.5" />
            <Trans>Show page {setting.pages[0]}</Trans>
          </button>
        )}
        {setting.source === "changed" && (
          <button type="button" onClick={() => onChange(setting.base)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:hover:bg-brand-500/10">
            <RotateCcw className="size-3.5" />
            <Trans>Undo my change</Trans>
          </button>
        )}
      </div>
    </div>
  )
}
