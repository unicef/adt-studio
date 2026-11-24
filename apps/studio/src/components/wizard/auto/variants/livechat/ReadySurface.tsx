import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Lock, Settings2, SlidersHorizontal, Sparkles } from "lucide-react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { ScopeField, useScopeSummary } from "../../../core/fields/ScopeField"
import { PrimaryButton } from "../../../core/ui"
import { SETTING_IDS } from "../../engine/answers"
import { NameField, SourceTag, useCreate } from "../../review/parts"
import { CreateFailed, CreateSteps } from "../chat/Create"
import { strategiesFor, type Derived, type SettingValue } from "../chat/useAnswers"
import type { CreateRun } from "../chat/useCreateRun"
import { SETTING_LABEL, SETTING_OPTIONS, valueTitle } from "../chat/words"
import { BookDevice, fitScale } from "../preview/stage/BookDevice"
import { screenPages, useDescribe, useScreenImages } from "../preview/stage/pages"
import { useBox } from "../preview/stage/useBox"
import { lookOf } from "../preview/useSetup"
import { Book3D } from "../../../core/Book3D"
import { StageHead, Surface } from "./Surface"

const HEAD = "lc-ready-head"

function useTitles(derived: Derived) {
  const { i18n } = useLingui()
  return (id: SetupSettingId) => {
    const v = valueTitle(id, derived.effective[id]?.value)
    return v ? i18n._(v) : String(derived.effective[id]?.value)
  }
}

/** The finished book on a computer screen, as the setup stands right now. */
function LivePreview({ rec, derived, file }: { rec: SetupRecommendation; derived: Derived; file: File }) {
  const look = lookOf(derived.effective)
  const pages = screenPages(rec, look.pageGrouping, rec.previewPage)
  const srcs = useScreenImages(file, pages)
  const describe = useDescribe()
  const { ref, box } = useBox()
  return (
    <div ref={ref} className="grid min-h-0 flex-1 place-items-center rounded-[20px] bg-gradient-to-br from-brand-50 to-brand-100/60 p-4">
      {box.w > 0 && <BookDevice key={JSON.stringify(look)} device="desktop" scale={fitScale("desktop", box.w - 32, box.h - 32)} shown={look} srcs={srcs} label={describe(look, "desktop", pages)} className="animate-[am-screen-in_0.32s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none" />}
    </div>
  )
}

/** Every setting in the wizard's names, with chips; locks on what can't change after creation. */
function SettingsPanel({ rec, derived, onChange }: { rec: SetupRecommendation; derived: Derived; onChange: (id: SetupSettingId, value: SettingValue) => void }) {
  const { i18n, t } = useLingui()
  const locked = new Set(rec.lockedSettings)
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      {SETTING_IDS.map((id) => {
        const current = derived.effective[id]?.value
        const only = id === "renderStrategy" ? strategiesFor(derived.effective.preset?.value) : null
        const name = i18n._(SETTING_LABEL[id])
        return (
          <div key={id} role="group" aria-label={name} className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              {name}
              {locked.has(id) && <Lock aria-label={t`Fixed once the book is created`} className="size-3" />}
              <SourceTag source={derived.source(id)} />
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SETTING_OPTIONS[id]
                .filter((o) => !only || only.includes(String(o.value)))
                .map((o) => {
                  const on = o.value === current
                  return (
                    <button key={String(o.value)} type="button" aria-pressed={on} onClick={() => onChange(id, o.value)} className={cn("inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold transition-[background-color,box-shadow,color,transform] duration-150 active:scale-[0.97]", on ? "bg-brand-600 text-primary-foreground shadow-[0_6px_16px_-8px_rgba(43,127,255,0.9)]" : "bg-card ring-1 ring-border hover:ring-brand-300")}>
                      {i18n._(o.title)}
                    </button>
                  )
                })}
            </div>
          </div>
        )
      })}
      <div role="group" aria-label={t`Page Range`} className="flex flex-col gap-1.5">
        <span className="text-[12.5px] text-muted-foreground">
          <Trans>Page Range</Trans>
        </span>
        <ScopeField />
      </div>
    </div>
  )
}

/**
 * The last living message. As a card it is the setup on one line, the name and Create. "Change"
 * grows it into a settings panel beside a live preview of the book; "Done" shrinks it back. Create
 * grows it into the making-of moment: the cover, what's really happening, then "Open the book".
 */
export function ReadySurface({ rec, derived, file, numPages, mode, run, onChange, onSettings, onCreate, onRetry, onRename, onOpenBook, onAllSettings, asked }: { rec: SetupRecommendation; derived: Derived; file: File; numPages: number; mode: "card" | "settings" | "create" | "line"; run?: CreateRun; onChange: (id: SetupSettingId, value: SettingValue) => void; onSettings: (open: boolean) => void; onCreate: () => void; onRetry: () => void; onRename: () => void; onOpenBook: (label: string) => void; onAllSettings: () => void; asked: number }) {
  const title = useTitles(derived)
  const scope = useScopeSummary(numPages)
  const create = useCreate(onCreate)
  const changed = SETTING_IDS.filter((id) => derived.source(id) !== "ai").length
  // eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
  const summary = [title("preset"), title("renderStrategy"), title("pageGrouping")].join(" · ")

  if (mode === "create" && run)
    return (
      <Surface name="lc-ready" expanded labelledBy={HEAD}>
        <div className="relative flex flex-col items-center gap-6 overflow-hidden px-8 py-10 text-center">
          <div aria-hidden className={cn("lc-glow absolute left-1/2 top-16 h-[260px] w-[520px] -translate-x-1/2 rounded-full blur-3xl motion-reduce:hidden", run.status === "done" ? "bg-emerald-300/30" : run.status === "failed" ? "bg-muted" : "bg-brand-300/35")} />
          <div className={cn("relative transition-[filter] duration-500", run.status === "failed" && "grayscale")}>
            <CoverOf file={file} />
          </div>
          <h2 id={HEAD} tabIndex={-1} className="relative text-[34px] font-bold leading-[1.05] tracking-[-0.03em] outline-none">
            {run.status === "done" ? (
              <Trans>
                {run.name} is <span className="bg-gradient-to-br from-emerald-400 to-emerald-700 bg-clip-text text-transparent">ready</span>
              </Trans>
            ) : run.status === "failed" ? (
              <Trans>Not created</Trans>
            ) : (
              <Trans>Making {run.name}…</Trans>
            )}
          </h2>
          <div className="relative w-full max-w-[420px] rounded-[18px] bg-card/80 p-4 text-left ring-1 ring-border backdrop-blur">
            {run.status === "failed" ? <CreateFailed run={run} current onRetry={onRetry} onRename={onRename} /> : <CreateSteps run={run} />}
          </div>
          {run.status === "done" && (
            <div className="relative flex flex-col items-center gap-2 lc-rise">
              <PrimaryButton onClick={() => onOpenBook(run.label!)} icon={<BookOpen className="size-4" />} className="h-12 px-7 text-[15px]">
                <Trans>Open the book</Trans>
              </PrimaryButton>
              <p className="text-[13px] text-muted-foreground">{run.warning ? <Trans>Processing didn&apos;t start. Start it from the book page.</Trans> : run.extract ? <Trans>The rest keeps converting in the background.</Trans> : <Trans>Start processing from the book page.</Trans>}</p>
            </div>
          )}
        </div>
      </Surface>
    )

  if (mode === "line")
    return (
      <Surface name="lc-ready" expanded={false} labelledBy={HEAD}>
        <button type="button" onClick={() => onSettings(false)} className="inline-flex items-center gap-2 text-left">
          <span id={HEAD} className="font-semibold">
            {summary}
          </span>
          <span className="text-[12.5px] font-semibold text-brand-700">
            <Trans>Back to it</Trans>
          </span>
        </button>
      </Surface>
    )

  if (mode === "settings")
    return (
      <Surface name="lc-ready" expanded labelledBy={HEAD}>
        <div className="flex h-[clamp(440px,calc(100vh-200px),760px)] flex-col gap-4 p-6">
          <StageHead
            id={HEAD}
            title={<Trans>Settings</Trans>}
            onCollapse={() => onSettings(false)}
            actions={
              <button type="button" onClick={onAllSettings} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50">
                <Settings2 className="size-3.5" />
                <Trans>All settings</Trans>
              </button>
            }
          />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,420px)_minmax(0,1fr)] gap-6">
            <SettingsPanel rec={rec} derived={derived} onChange={onChange} />
            <div className="flex min-h-0 flex-col gap-2">
              <LivePreview rec={rec} derived={derived} file={file} />
              <p className="text-center text-[12.5px] text-muted-foreground">
                <Trans>Page {rec.previewPage}, as your book will show it.</Trans>
              </p>
            </div>
          </div>
        </div>
      </Surface>
    )

  return (
    <Surface name="lc-ready" expanded labelledBy={HEAD} className="mr-auto max-w-[640px]">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground">{asked === 0 ? <Trans>Nothing to ask. Here&apos;s the setup:</Trans> : <Trans>Thanks! Here&apos;s the setup:</Trans>}</p>
            <h2 id={HEAD} tabIndex={-1} className="mt-0.5 text-[19px] font-bold leading-snug tracking-[-0.015em] outline-none">
              {summary}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted-foreground">
              <span>{scope}</span>
              {changed === 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                  <Sparkles className="size-3" />
                  <Trans>Picked by AI</Trans>
                </span>
              ) : (
                <span className="font-semibold text-foreground">
                  <Plural value={changed} one="# changed by you" other="# changed by you" />
                </span>
              )}
            </p>
          </div>
          <button type="button" aria-expanded={false} onClick={() => onSettings(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold text-brand-700 ring-1 ring-brand-200 transition-colors hover:bg-brand-50">
            <SlidersHorizontal className="size-3.5" />
            <Trans>Change</Trans>
          </button>
        </div>
        <div className="h-px bg-border/70" />
        <NameField />
        <div className="flex justify-end">
          <PrimaryButton onClick={create} icon={<Sparkles className="size-4" />}>
            <Trans>Create the book</Trans>
          </PrimaryButton>
        </div>
      </div>
    </Surface>
  )
}

function CoverOf({ file }: { file: File }) {
  const src = useScreenImages(file, [1])[0]
  return <Book3D src={src} alt="" height={190} maxWidth={190} settle />
}
