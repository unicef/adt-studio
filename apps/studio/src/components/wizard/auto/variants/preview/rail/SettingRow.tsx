import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupSettingId } from "@adt/types"
import { Check, ChevronDown, Lock, MessageCircleQuestion, PencilLine, Sparkles } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { RULE_WHY } from "../../../engine/words"
import { CHOICES, choiceOf, SETTING_ICON, SETTING_LABEL } from "../labels"
import type { CanvasSetup, Source } from "../useSetup"

export function SourceMark({ source }: { source: Source }) {
  if (source === "changed")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
        <PencilLine className="size-3" />
        <Trans>Changed</Trans>
      </span>
    )
  if (source === "answered")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30">
        <MessageCircleQuestion className="size-3" />
        <Trans>Your answer</Trans>
      </span>
    )
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">
      <Sparkles className="size-3" />
      <Trans>AI</Trans>
    </span>
  )
}

/**
 * One setting in the rail, with the wizard's names: its value and where it came from. Opening it
 * says why and lists every value; one click changes it and the preview follows.
 */
export function SettingRow({ id, index, setup, open, onToggle }: { id: SetupSettingId; index: number; setup: CanvasSetup; open: boolean; onToggle: () => void }) {
  const { t, i18n } = useLingui()
  const value = setup.look[id]
  const source = setup.source(id)
  const locked = setup.rec.lockedSettings.includes(id)
  const Icon = SETTING_ICON[id]
  const current = choiceOf(id, value)
  const aiChoice = choiceOf(id, setup.ai[id])
  const rule = setup.rule(id)
  const why = source === "changed" ? null : rule && RULE_WHY[rule] ? i18n._(RULE_WHY[rule]) : null
  const label = i18n._(SETTING_LABEL[id])
  const aiTitle = aiChoice ? i18n._(aiChoice.title) : ""
  const panel = `pf-setting-${id}`
  return (
    <li style={{ animationDelay: `${index * 60}ms` }} className={cn("animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] rounded-[18px] transition-[background-color,box-shadow] duration-200 motion-reduce:animate-none", open ? "bg-card shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] ring-1 ring-border" : "")}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panel} className={cn("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 flex w-full items-center gap-3 rounded-[18px] px-2.5 py-2 text-left transition-colors duration-150", !open && "hover:bg-card/70")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground">
            {label}
            {locked && (
              <>
                <Lock aria-hidden className="size-3" />
                <span className="sr-only">
                  <Trans>(fixed once the book is created)</Trans>
                </span>
              </>
            )}
          </span>
          <span key={String(value)} className="truncate text-[14.5px] font-semibold leading-tight animate-[am-screen-in_0.32s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
            {current ? i18n._(current.title) : String(value)}
          </span>
        </span>
        <SourceMark source={source} />
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>
      <Collapsible shown={open}>
        <div id={panel} inert={!open} className="flex flex-col gap-2.5 px-3 pb-3 pt-1">
          <p className="text-[12.5px] leading-snug text-muted-foreground">
            {source === "changed" ? <Trans>Changed by you. The AI picked {aiTitle}.</Trans> : why}
            {source === "answered" && (
              <>
                {" "}
                <Trans>From your answer.</Trans>
              </>
            )}
          </p>
          <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
            {CHOICES[id].map((c) => {
              const checked = c.value === String(value)
              const ai = c.value === String(setup.ai[id])
              return (
                <button key={c.value} type="button" role="radio" aria-checked={checked} onClick={() => setup.set(id, c.value)} className={cn("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150", checked ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-muted")}>
                  <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", checked ? "border-brand-600 bg-brand-600 text-primary-foreground" : "border-border")}>{checked && <Check className="size-2.5 stroke-[3.5]" />}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight">
                      {i18n._(c.title)}
                      {ai && (
                        <span title={t`The AI's pick`} className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-brand-700">
                          <Sparkles className="size-3" />
                          <Trans>AI pick</Trans>
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] leading-snug text-muted-foreground">{i18n._(c.hint)}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {locked && (
            <p className="flex items-start gap-1.5 rounded-xl bg-muted/70 px-2.5 py-2 text-[12px] leading-snug text-muted-foreground">
              <Lock className="mt-0.5 size-3 shrink-0" />
              <Trans>This can&apos;t be changed after the book is created, so it&apos;s worth a look now.</Trans>
            </p>
          )}
        </div>
      </Collapsible>
    </li>
  )
}
