import { useState, type ReactNode } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight, Check, Lock, Sparkles, Zap } from "lucide-react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { PrimaryButton } from "../../../core/ui"
import { RULE_WHY, SETTING_NAME, SETTING_VALUE } from "../../engine/words"
import { SETTING_IDS } from "../../engine/answers"
import { Assistant } from "./Assistant"
import { useIsWizard, WizardPose } from "./WizardPose"
import { Screen } from "./Screen"
import { screenPages, useScreenImages } from "./screens/pages"
import type { LookOption } from "./PreviewChoices"

/** Settings fixed once the book is set up (the lock in the Check screens). */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a setting id, never shown
const LOCKED: SetupSettingId[] = ["pageGrouping"]

/**
 * The options, one at a time and in depth: the picture large, the assistant's short take, then
 * when it fits, when another option fits better (a tap away), books it suits, everything it sets
 * up in the book and why, how the book is made with it, why the assistant guessed it, and whether
 * it can be changed. Tabs, arrows or the arrow keys move between the options; the one shown can
 * be picked from here.
 */
export function OptionsHelp({ open, onOpenChange, rec, options, page, chosen, file, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; rec: SetupRecommendation; options: LookOption[]; page: number; chosen?: string; file: File | null | undefined; onPick: (value: string) => void }) {
  const wizard = useIsWizard()
  const [at, setAt] = useState(0)
  const [was, setWas] = useState(false)
  // Each time it opens, it starts on the picked option.
  if (open !== was) {
    setWas(open)
    if (open) setAt(Math.max(0, options.findIndex((o) => o.value === chosen)))
  }
  const o = options[at]!
  const go = (d: number) => setAt((i) => (i + d + options.length) % options.length)
  const show = (value: string) => setAt(Math.max(0, options.findIndex((x) => x.value === value)))
  const picked = chosen === o.value
  const current = options.find((x) => x.value === chosen)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(90vh,780px)] max-w-[920px] flex-col gap-0 overflow-hidden p-0"
        onKeyDown={(e) => {
          if (e.target instanceof HTMLElement && e.target.closest("[role=tablist]")) return
          if (e.key === "ArrowRight") go(1)
          else if (e.key === "ArrowLeft") go(-1)
        }}
      >
        <DialogTitle className="sr-only">
          <Trans>The options, in detail</Trans>
        </DialogTitle>
        <div
          role="tablist"
          className="flex shrink-0 flex-wrap gap-1.5 border-b border-border px-6 pb-4 pr-14 pt-5"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1)
            else if (e.key === "ArrowLeft") go(-1)
          }}
        >
          {options.map((x, i) => (
            <button
              key={x.value}
              type="button"
              role="tab"
              aria-selected={i === at}
              tabIndex={i === at ? 0 : -1}
              onClick={() => setAt(i)}
              className={cn("inline-flex min-h-9 items-center gap-1 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors", i === at ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {chosen === x.value && <Check className="size-3.5 stroke-[3]" />}
              {x.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div key={o.value} role="tabpanel" className="gd-help-in grid gap-x-8 gap-y-6 px-6 py-6 md:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
            {/* The picture and the assistant's short take stay in view while the details scroll. */}
            <div className="flex flex-col gap-4 md:sticky md:top-0 md:self-start">
              <HelpPicture rec={rec} option={o} page={page} file={file} />
              <div className="flex items-start gap-3">
                {wizard ? <WizardPose pose="hello" size={72} className="-mt-1 shrink-0" /> : <Assistant mood="talking" size={44} />}
                <div className="min-w-0 flex-1 rounded-[18px] bg-muted/60 px-4 py-3">
                  <DialogDescription asChild>
                    <div>
                      <p className="text-[18px] font-semibold text-foreground">{o.label}</p>
                      <p className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground">{o.more ?? o.line}</p>
                    </div>
                  </DialogDescription>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-6 text-[14.5px] leading-relaxed">
              {o.why && (
                <Part title={<Trans>Why I suggested it</Trans>}>
                  <div className="rounded-[14px] bg-brand-50 px-4 py-3 text-brand-900 dark:bg-brand-500/10 dark:text-brand-100">{o.why}</div>
                </Part>
              )}

              {o.guide && (
                <Part title={<Trans>Pick it when</Trans>}>
                  <ul className="flex flex-col gap-1.5">
                    {o.guide.fits.map((m) => (
                      <li key={m.id} className="flex gap-2">
                        <Check className="mt-1 size-4 shrink-0 stroke-[2.5] text-emerald-600 dark:text-emerald-400" />
                        <Said m={m} />
                      </li>
                    ))}
                  </ul>
                </Part>
              )}

              {o.guide && o.guide.better.some((b) => options.some((x) => x.value === b.go)) && (
                <Part title={<Trans>Another option fits better when</Trans>}>
                  <ul className="flex flex-col gap-2">
                    {o.guide.better
                      .filter((b) => options.some((x) => x.value === b.go))
                      .map((b) => (
                        <li key={b.when.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-muted-foreground">
                            <Said m={b.when} />
                          </span>
                          <button type="button" onClick={() => show(b.go)} className="lc-link inline-flex min-h-8 items-center gap-1 text-[13.5px] font-medium">
                            <ArrowRight className="size-3.5" />
                            {options.find((x) => x.value === b.go)!.label}
                          </button>
                        </li>
                      ))}
                  </ul>
                </Part>
              )}

              {o.guide && (
                <Part title={<Trans>Books like this</Trans>}>
                  <p className="text-muted-foreground">
                    <Said m={o.guide.examples} />
                  </p>
                </Part>
              )}

              {o.settings && <Sets option={o} current={current} />}

              {o.guide?.making && (
                <Part title={<Trans>How the book is made</Trans>}>
                  <p className="flex gap-2 text-muted-foreground">
                    {o.guide.making.ai ? <Sparkles className="mt-1 size-4 shrink-0 text-brand-500" /> : <Zap className="mt-1 size-4 shrink-0 text-amber-500" />}
                    <Said m={o.guide.making.says} />
                  </p>
                </Part>
              )}

              <Part title={<Trans>Can I change it later?</Trans>}>
                <p className="text-muted-foreground">
                  <Trans>Yes, until you set up the book: you can come back to any step before that.</Trans>{" "}
                  {(o.only ?? SETTING_IDS).some((id) => LOCKED.includes(id)) && <Trans>Pictures across two pages can&apos;t be changed after that.</Trans>}
                </p>
              </Part>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} className="inline-grid size-10 place-items-center rounded-full border border-border hover:bg-muted">
              <ArrowLeft className="size-4" />
              <span className="sr-only">
                <Trans>Previous option</Trans>
              </span>
            </button>
            <button type="button" onClick={() => go(1)} className="inline-grid size-10 place-items-center rounded-full border border-border hover:bg-muted">
              <ArrowRight className="size-4" />
              <span className="sr-only">
                <Trans>Next option</Trans>
              </span>
            </button>
            <span className="ml-2 text-[13px] tabular-nums text-muted-foreground">
              <Trans>
                {at + 1} of {options.length}
              </Trans>
            </span>
          </div>
          {picked ? (
            <span className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[14px] font-medium text-brand-700 dark:text-brand-300">
              <Check className="size-4 stroke-[3]" />
              <Trans>This is your pick</Trans>
            </span>
          ) : (
            <PrimaryButton onClick={() => onPick(o.value)}>
              <Trans>Pick this one</Trans>
            </PrimaryButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Part({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-foreground/70">{title}</h3>
      {children}
    </section>
  )
}

function Said({ m }: { m: MessageDescriptor }) {
  const { i18n } = useLingui()
  return <>{i18n._(m)}</>
}

/** Everything the option sets up in the book: each setting, what it means, why, and whether it differs from the current pick. */
function Sets({ option, current }: { option: LookOption; current?: LookOption }) {
  const { i18n } = useLingui()
  const ids = (option.only ?? SETTING_IDS).filter((id) => option.settings?.[id])
  if (!ids.length) return null
  return (
    <Part title={<Trans>What it sets up in your book</Trans>}>
      <ul className="flex flex-col divide-y divide-border rounded-[14px] border border-border">
        {ids.map((id) => {
          const pick = option.settings![id]!
          const words = SETTING_VALUE[id]?.[String(pick.value)]
          const why = RULE_WHY[pick.rule]
          const differs = current && current.value !== option.value && String(current.settings?.[id]?.value) !== String(pick.value)
          return (
            <li key={id} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">{i18n._(SETTING_NAME[id])}</span>
                <span className="font-semibold">{words ? i18n._(words.name) : String(pick.value)}</span>
                {differs && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    <Trans>Changes from your pick</Trans>
                  </span>
                )}
                {LOCKED.includes(id) && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                    <Lock className="size-3" />
                    <Trans>Fixed once set up</Trans>
                  </span>
                )}
              </span>
              {words && <span className="text-[13.5px] text-muted-foreground">{i18n._(words.means)}</span>}
              {why && (
                <span className="text-[13px] text-muted-foreground/80">
                  <Trans>Why:</Trans> {i18n._(why)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </Part>
  )
}

function HelpPicture({ rec, option, page, file }: { rec: SetupRecommendation; option: LookOption; page: number; file: File | null | undefined }) {
  const pages = screenPages(rec, option.look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  return (
    <span aria-hidden className="qd18-pv grid h-[220px] w-full place-items-center overflow-hidden rounded-[14px] bg-muted">
      {option.art ? <span className="block h-full w-full p-4">{option.art}</span> : <Screen shown={option.look} srcs={srcs} width={300} />}
    </span>
  )
}
