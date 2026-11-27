import { useState, type ReactNode } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight, Check, Smartphone, Sparkles, Zap } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { PrimaryButton } from "../../../core/ui"
import { WizardPose } from "./WizardPose"
import { Screen } from "./Screen"
import { screenPages, useScreenImages } from "./screens/pages"
import type { LookOption } from "./PreviewChoices"


/**
 * The options, one at a time and in depth: the picture large, the assistant's short take, then
 * when it fits, when another option fits better (a tap away), books it suits, how the book is made with it, why the assistant guessed it, and whether
 * it can be changed. Tabs, arrows or the arrow keys move between the options; the one shown can
 * be picked from here.
 */
export function OptionsHelp({ open, onOpenChange, rec, options, page, chosen, file, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; rec: SetupRecommendation; options: LookOption[]; page: number; chosen?: string; file: File | null | undefined; onPick: (value: string) => void }) {
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(88vh,720px)] max-w-[820px] flex-col gap-0 overflow-hidden p-0 outline-none focus:outline-none focus-visible:outline-none"
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
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 pr-14 pt-4"
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
              className={cn(
                "group relative flex min-w-[112px] flex-1 basis-0 flex-col items-center gap-1.5 rounded-t-[12px] px-2 pb-3 pt-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
                i === at ? "text-brand-700 dark:text-brand-300" : "text-muted-foreground hover:bg-black/[0.03] hover:text-foreground dark:hover:bg-white/[0.04]",
              )}
            >
              <span aria-hidden className={cn("grid h-[52px] w-[84px] place-items-center overflow-hidden rounded-[8px] transition-opacity", i === at ? "opacity-100" : "opacity-70 group-hover:opacity-100")}>
                {x.helpArt ?? x.art ?? <TabPicture rec={rec} option={x} page={page} file={file} />}
              </span>
              <span className="flex items-start gap-1 text-[12.5px] font-medium leading-tight">
                {chosen === x.value && <Check aria-hidden className="mt-px size-3.5 shrink-0 stroke-[3]" />}
                <span className="line-clamp-2">{x.label}</span>
              </span>
              {chosen === x.value && (
                <span className="sr-only">
                  <Trans>(your pick)</Trans>
                </span>
              )}
              <span aria-hidden className={cn("absolute inset-x-2 bottom-0 h-[3px] rounded-full transition-colors", i === at ? "bg-brand-500" : "bg-transparent")} />
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <CardBody key={o.value} o={o} options={options} rec={rec} page={page} file={file} show={show} />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-3">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} className="inline-grid size-10 place-items-center rounded-full border border-border text-brand-700 hover:border-brand-300 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10">
              <ArrowLeft className="size-4" />
              <span className="sr-only">
                <Trans>Previous option</Trans>
              </span>
            </button>
            <button type="button" onClick={() => go(1)} className="inline-grid size-10 place-items-center rounded-full border border-border text-brand-700 hover:border-brand-300 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10">
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
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground/65">{title}</h3>
      {children}
    </section>
  )
}

function Said({ m }: { m: MessageDescriptor }) {
  const { i18n } = useLingui()
  return <>{i18n._(m)}</>
}

function TabPicture({ rec, option, page, file }: { rec: SetupRecommendation; option: LookOption; page: number; file: File | null | undefined }) {
  const pages = screenPages(rec, option.look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  return <Screen shown={option.look} srcs={srcs} width={80} />
}

function HelpPicture({ rec, option, page, file }: { rec: SetupRecommendation; option: LookOption; page: number; file: File | null | undefined }) {
  const pages = screenPages(rec, option.look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  return (
    <span aria-hidden className="qd18-pv grid h-[150px] w-full place-items-center overflow-hidden rounded-[12px] bg-muted">
      {option.helpArt || option.art ? <span className="block h-full w-full p-3">{option.helpArt ?? option.art}</span> : <Screen shown={option.look} srcs={srcs} width={210} />}
    </span>
  )
}

type BodyProps = { o: LookOption; options: LookOption[]; rec: SetupRecommendation; page: number; file: File | null | undefined; show: (value: string) => void }

/** The details laid out as sections: the option at a glance, then the signs, then the settings. */
function CardBody({ o, options, rec, page, file, show }: BodyProps) {
  return (
          <div role="tabpanel" className="gd-help-in flex flex-col gap-5 px-6 py-5 text-[14px] leading-relaxed">
            {/* The option at a glance: its picture, and the assistant saying what it is. */}
            <div className="grid items-center gap-5 sm:grid-cols-[230px_minmax(0,1fr)]">
              <HelpPicture rec={rec} option={o} page={page} file={file} />
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <WizardPose pose="hello" size={52} className="-my-1 shrink-0" />
                  <p className="text-[19px] font-semibold leading-tight">{o.label}</p>
                </div>
                <DialogDescription className="text-[14.5px] leading-relaxed text-muted-foreground">{o.more ?? o.line}</DialogDescription>
                {o.guide && (
                  <p className="text-[13px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      <Trans>Books like this:</Trans>
                    </span>{" "}
                    <Said m={o.guide.examples} />
                  </p>
                )}
                {o.phone && (
                  <p className="flex gap-1.5 text-[13px] text-muted-foreground">
                    <Smartphone className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
                    <span>
                      <span className="font-medium text-foreground/80">
                        <Trans>On a phone:</Trans>
                      </span>{" "}
                      {o.phone}
                    </span>
                  </p>
                )}
                {o.guide?.making && (
                  <p className="flex gap-1.5 text-[13px] text-muted-foreground">
                    {o.guide.making.ai ? <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand-500" /> : <Zap className="mt-0.5 size-3.5 shrink-0 text-amber-500" />}
                    <Said m={o.guide.making.says} />
                  </p>
                )}
              </div>
            </div>

            {o.why && (
              <div className="rounded-[12px] bg-brand-50 px-4 py-2.5 text-[13.5px] text-brand-900 dark:bg-brand-500/10 dark:text-brand-100">
                <span className="font-semibold">{o.guess ? <Trans>Why I suggested it:</Trans> : <Trans>Why it could be this one:</Trans>}</span>{" "}
                {o.why}
              </div>
            )}

            {o.guide && (
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Part title={<Trans>Pick it when</Trans>}>
                  <ul className="flex flex-col gap-1">
                    {o.guide.fits.map((m) => (
                      <li key={m.id} className="flex gap-2">
                        <Check className="mt-1 size-3.5 shrink-0 stroke-[2.5] text-brand-600 dark:text-brand-400" />
                        <Said m={m} />
                      </li>
                    ))}
                  </ul>
                </Part>
                {o.guide.better.some((b) => options.some((x) => x.value === b.go)) && (
                  <Part title={<Trans>Another option fits better when</Trans>}>
                    <ul className="flex flex-col gap-1">
                      {o.guide.better
                        .filter((b) => options.some((x) => x.value === b.go))
                        .map((b) => (
                          <li key={b.when.id} className="flex gap-2">
                            <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                            <span>
                              <span className="text-muted-foreground">
                                <Said m={b.when} />
                              </span>{" "}
                              <button type="button" onClick={() => show(b.go)} className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-500 dark:text-brand-300 dark:decoration-brand-500/50">
                                {options.find((x) => x.value === b.go)!.label}
                              </button>
                            </span>
                          </li>
                        ))}
                    </ul>
                  </Part>
                )}
              </div>
            )}


            <p className="text-[12.5px] text-muted-foreground">
              <Trans>You can change this until you set up the book.</Trans>{" "}
            </p>
          </div>
  )
}
