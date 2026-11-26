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
import { useHelpLook } from "./helpLook"
import { useTalk } from "./useTalk"

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
  const look = useHelpLook()
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
        className="top-[6vh] flex max-h-[88vh] max-w-[780px] translate-y-0 flex-col gap-0 overflow-hidden p-0"
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
          className="flex shrink-0 flex-wrap gap-1.5 border-b border-border px-6 pb-3.5 pr-14 pt-4"
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
              className={cn("inline-flex min-h-9 items-center gap-1 rounded-full border px-3.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2", i === at ? "border-transparent bg-brand-600 text-white dark:bg-brand-500" : "border-border text-muted-foreground hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300")}
            >
              {chosen === x.value && <Check className="size-3.5 stroke-[3]" />}
              {x.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {look === "chat" ? (
            <ChatBody key={o.value} o={o} options={options} current={current} rec={rec} page={page} file={file} wizard={wizard} show={show} />
          ) : (
            <CardBody key={o.value} o={o} options={options} current={current} rec={rec} page={page} file={file} wizard={wizard} show={show} />
          )}
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

/** Everything the option sets up in the book: each setting, what it means, why, and whether it differs from the current pick. */
function Sets({ option, current }: { option: LookOption; current?: LookOption }) {
  const { i18n } = useLingui()
  const ids = (option.only ?? SETTING_IDS).filter((id) => option.settings?.[id])
  if (!ids.length) return null
  return (
    <Part title={<Trans>What it sets up in your book</Trans>}>
      <ul className="flex flex-col divide-y divide-border rounded-[12px] border border-border">
        {ids.map((id) => {
          const pick = option.settings![id]!
          const words = SETTING_VALUE[id]?.[String(pick.value)]
          const why = RULE_WHY[pick.rule]
          const differs = current && current.value !== option.value && String(current.settings?.[id]?.value) !== String(pick.value)
          return (
            <li key={id} className="grid gap-x-4 gap-y-0.5 px-3.5 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
              <span className="text-[13px] text-muted-foreground">{i18n._(SETTING_NAME[id])}</span>
              <span className="min-w-0 text-[13.5px]">
                <span className="font-semibold">{words ? i18n._(words.name) : String(pick.value)}</span>
                {differs && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-[1px] text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    <Trans>Changes from your pick</Trans>
                  </span>
                )}
                {LOCKED.includes(id) && <Lock className="ml-1.5 inline size-3 align-[-1px] text-muted-foreground" />}
                <span className="block text-muted-foreground">
                  {words && i18n._(words.means)} {why && <span className="text-muted-foreground/75">{i18n._(why)}</span>}
                </span>
              </span>
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
    <span aria-hidden className="qd18-pv grid h-[150px] w-full place-items-center overflow-hidden rounded-[12px] bg-muted">
      {option.art ? <span className="block h-full w-full p-3">{option.art}</span> : <Screen shown={option.look} srcs={srcs} width={210} />}
    </span>
  )
}

type BodyProps = { o: LookOption; options: LookOption[]; current?: LookOption; rec: SetupRecommendation; page: number; file: File | null | undefined; wizard: boolean; show: (value: string) => void }

/** The details laid out as sections: the option at a glance, then the signs, then the settings. */
function CardBody({ o, options, current, rec, page, file, wizard, show }: BodyProps) {
  return (
          <div role="tabpanel" className="gd-help-in flex flex-col gap-5 px-6 py-5 text-[14px] leading-relaxed">
            {/* The option at a glance: its picture, and the assistant saying what it is. */}
            <div className="grid items-center gap-5 sm:grid-cols-[230px_minmax(0,1fr)]">
              <HelpPicture rec={rec} option={o} page={page} file={file} />
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  {wizard ? <WizardPose pose="hello" size={52} className="-my-1 shrink-0" /> : <Assistant mood="talking" size={36} />}
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
                <span className="font-semibold">
                  <Trans>Why I suggested it:</Trans>
                </span>{" "}
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

            {o.settings && <Sets option={o} current={current} />}

            <p className="text-[12.5px] text-muted-foreground">
              <Trans>You can change this until you set up the book.</Trans>{" "}
              {(o.only ?? SETTING_IDS).some((id) => LOCKED.includes(id)) && <Trans>Pictures across two pages can&apos;t be changed after that.</Trans>}
            </p>
          </div>
  )
}

/**
 * The same details as the assistant saying them: it sits on the left and talks in a run of speech
 * bubbles that come in one after another, the way it talks on the Check screens.
 */
function ChatBody({ o, options, current, rec, page, file, wizard, show }: BodyProps) {
  const { i18n } = useLingui()
  const talking = useTalk({ current: null }, o.value)
  const better = o.guide?.better.filter((b) => options.some((x) => x.value === b.go)) ?? []
  const locked = (o.only ?? SETTING_IDS).some((id) => LOCKED.includes(id))
  const ids = (o.only ?? SETTING_IDS).filter((id) => o.settings?.[id])
  let n = 0
  const say = (node: ReactNode, wide = false) => (
    <Said2 i={n++} wide={wide}>
      {node}
    </Said2>
  )
  return (
    <div role="tabpanel" className="flex gap-3 px-5 py-5 text-[14.5px] leading-relaxed">
      <div className="shrink-0 pt-1">
        <div className="sticky top-0">{wizard ? <WizardPose pose="hello" size={64} talking={talking} /> : <Assistant mood={talking ? "talking" : "idle"} size={44} />}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        {say(
          <DialogDescription asChild>
            <p>
              <span className="font-semibold text-foreground">{o.label}.</span> <span className="text-foreground/85">{o.more ?? o.line}</span>
            </p>
          </DialogDescription>,
        )}
        {say(<HelpPicture rec={rec} option={o} page={page} file={file} />, true)}
        {o.why &&
          say(
            <div className="text-foreground/85">
              <span className="font-semibold text-brand-700 dark:text-brand-300">
                <Trans>That&apos;s my guess for your book.</Trans>
              </span>{" "}
              {o.why}
            </div>,
          )}
        {o.guide &&
          say(
            <div>
              <p className="font-medium">
                <Trans>It&apos;s the right pick when:</Trans>
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {o.guide.fits.map((m) => (
                  <li key={m.id} className="flex gap-2 text-foreground/85">
                    <Check className="mt-1 size-3.5 shrink-0 stroke-[2.5] text-brand-600 dark:text-brand-400" />
                    {i18n._(m)}
                  </li>
                ))}
              </ul>
            </div>,
          )}
        {better.length > 0 &&
          say(
            <div>
              <p className="font-medium">
                <Trans>But have a look at another one if:</Trans>
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {better.map((b) => (
                  <li key={b.when.id} className="flex gap-2 text-foreground/85">
                    <ArrowRight className="mt-1 size-3.5 shrink-0 text-brand-500" />
                    <span>
                      {i18n._(b.when)}{" "}
                      <button type="button" onClick={() => show(b.go)} className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-500 dark:text-brand-300 dark:decoration-brand-500/50">
                        {options.find((x) => x.value === b.go)!.label}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>,
          )}
        {o.guide &&
          say(
            <p className="text-foreground/85">
              <Trans>It suits books like these:</Trans> {i18n._(o.guide.examples)}
            </p>,
          )}
        {ids.length > 0 &&
          say(
            <div>
              <p className="font-medium">
                <Trans>If you pick it, I&apos;ll set up:</Trans>
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {ids.map((id) => {
                  const pick = o.settings![id]!
                  const words = SETTING_VALUE[id]?.[String(pick.value)]
                  const differs = current && current.value !== o.value && String(current.settings?.[id]?.value) !== String(pick.value)
                  return (
                    <li key={id} className="text-[13.5px] text-foreground/85">
                      <span className="text-muted-foreground">{i18n._(SETTING_NAME[id])}:</span> <span className="font-semibold text-foreground">{words ? i18n._(words.name) : String(pick.value)}</span>
                      {differs && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px align-[1px] text-[10.5px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          <Trans>Changes from your pick</Trans>
                        </span>
                      )}
                      {words && <span className="block text-muted-foreground">{i18n._(words.means)}</span>}
                    </li>
                  )
                })}
              </ul>
            </div>,
          )}
        {say(
          <p className="text-foreground/85">
            {o.guide?.making && <>{i18n._(o.guide.making.says)} </>}
            <Trans>You can change this until you set up the book.</Trans>
            {locked && (
              <>
                {" "}
                <Trans>Pictures across two pages can&apos;t be changed after that.</Trans>
              </>
            )}
          </p>,
        )}
      </div>
    </div>
  )
}

/** One speech bubble in the chat; each comes in a beat after the one before. */
function Said2({ i, wide, children }: { i: number; wide: boolean; children: ReactNode }) {
  return (
    <div className={cn("gd-chat-in rounded-[18px] bg-muted/70 px-4 py-2.5", i === 0 && "rounded-tl-[6px]", wide ? "w-full max-w-[340px] p-1.5" : "max-w-[600px]")} style={{ animationDelay: `${i * 90}ms` }}>
      {children}
    </div>
  )
}
