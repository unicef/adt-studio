import { useState, type ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, ChevronRight, Lock, Settings2, Sparkles } from "lucide-react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { ScopeField, useScopeSummary } from "../../../core/fields/ScopeField"
import { SWAP } from "../../../core/ui"
import { SETTING_IDS, strategiesFor } from "../../engine/answers"
import { RULE_WHY, SETTING_VALUE } from "../../engine/words"
import { SourceTag } from "../../review/parts"
import { AutoHeight } from "../livechat/ideas/expand/AutoHeight"
import { useReadyView } from "../livechat/ideas/expand/HeightMorph"
import { morphName, useMorph } from "../livechat/ideas/expand/morph"
import { SideCanvas } from "../livechat/ideas/expand/SideCanvas"
import { PageStrip } from "./Evidence"
import { useIdea } from "./ideas"
import { useLiving } from "./look"
import type { Derived, SettingValue } from "./useAnswers"
import { plainTitle, SETTING_LABEL, SETTING_OPTIONS, valueTitle } from "./words"

function Row({ label, value, tag, locked, open, onToggle, children, id }: { label: ReactNode; value: ReactNode; tag?: ReactNode; locked?: boolean; open: boolean; onToggle: () => void; children: ReactNode; id: string }) {
  const { t } = useLingui()
  const Reveal = useExpandIdea() === "b8" ? AutoHeight : Collapsible
  return (
    <li className={cn("rounded-[16px] transition-colors duration-200", open && "bg-muted/60")}>
      <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={onToggle} className="flex w-full items-center gap-2 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-muted/60">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground sm:w-[150px]">
            {label}
            {locked && <Lock aria-label={t`Fixed once the book is created`} className="size-3 text-muted-foreground/80" />}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {value}
            {tag}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      <Reveal shown={open}>
        <div id={`${id}-panel`} inert={!open} className="flex flex-col gap-2.5 px-3 pb-3 pt-0.5">
          {children}
        </div>
      </Reveal>
    </li>
  )
}

function Options({ id, only, current, onPick, label }: { id: SetupSettingId; only: string[] | null; current: SettingValue | undefined; onPick: (v: SettingValue) => void; label: string }) {
  const { i18n } = useLingui()
  const living = useLiving()
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {SETTING_OPTIONS[id].filter((o) => !only || only.includes(String(o.value))).map((o) => {
        const on = o.value === current
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(o.value)}
            className={cn("inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,box-shadow,color,transform] duration-150 active:scale-[0.97]", living ? "font-medium" : "", on ? cn("bg-brand-600 text-primary-foreground", !living && "shadow-[0_6px_16px_-8px_rgba(43,127,255,0.9)]") : cn("text-foreground ring-1 ring-border hover:ring-brand-300", living ? "bg-[var(--lc-bubble)]" : "bg-card"))}
          >
            {i18n._(o.title)}
          </button>
        )
      })}
    </div>
  )
}

/** The "expand" idea picked in the lab, in Living chat only. */
function useExpandIdea() {
  const idea = useIdea("expand")
  return useLiving() ? idea : "now"
}

/**
 * The setup, folded to one line ("Storybook · Fixed Layout · Spread") with "Change". Opened, each
 * setting is a row in the wizard's names that says where its value came from (an answer or a change
 * by hand; the AI's are untagged), carries a lock when it can't change after creation, and opens to
 * chips with what the value means, why, and the pages. Page Range is the upload card's own choice.
 */
export function SettingsCard({ rec, derived, onChange, frozen, numPages, file, onAllSettings }: { rec: SetupRecommendation; derived: Derived; onChange: (id: SetupSettingId, value: SettingValue) => void; frozen: boolean; numPages: number; file: File | null | undefined; onAllSettings: () => void }) {
  const { i18n, t } = useLingui()
  const idea = useExpandIdea()
  const living = useLiving()
  const morph = useMorph()
  const ready = useReadyView()
  const [shownAll, setShownAll] = useState(false)
  // b10: the ready card owns which page shows (the setup, or the settings to change).
  const expanded = idea === "b10" && ready ? ready.view === "change" : shownAll
  const toggleAll = () => {
    if (idea === "b10" && ready) return ready.setView(expanded ? "main" : "change")
    if (idea === "b6") return morph(() => setShownAll(!expanded))
    setShownAll(!expanded)
  }
  const [open, setOpen] = useState<string | null>(null)
  const scope = useScopeSummary(numPages)
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key))
  const changed = SETTING_IDS.filter((id) => derived.source(id) !== "ai").length
  const locked = new Set(rec.lockedSettings)
  const title = (id: SetupSettingId) => {
    const v = valueTitle(id, derived.effective[id]?.value)
    return v ? i18n._(v) : String(derived.effective[id]?.value)
  }
  // eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
  const summary = (["preset", "renderStrategy", "pageGrouping"] as SetupSettingId[])
    .map((id) => {
      if (!living) return title(id)
      // Living chat: the setup in plain words ("Story · Picture beside the words · …").
      const plain = plainTitle(id, derived.effective[id]?.value)
      return plain ? i18n._(plain) : title(id)
    })
    .join(" · ")
  const all = (
    <div id="chat-settings-all" inert={!expanded} className={idea === "b9" ? undefined : "pt-2"}>
      <ul className="-mx-2 flex flex-col">
        {SETTING_IDS.map((id) => {
          const pick = derived.effective[id]
          const source = derived.source(id)
          const means = SETTING_VALUE[id]?.[String(pick?.value)]?.means
          const why = pick && RULE_WHY[pick.rule]
          const allowed = id === "renderStrategy" ? strategiesFor(derived.effective.preset?.value) : null
          const name = i18n._(SETTING_LABEL[id])
          return (
            <Row
              key={id}
              id={`chat-setting-${id}`}
              label={name}
              locked={locked.has(id)}
              open={open === id}
              onToggle={() => toggle(id)}
              value={
                <span key={String(pick?.value)} className={cn("text-[14.5px] font-semibold", SWAP)}>
                  {title(id)}
                </span>
              }
              tag={<SourceTag source={source} />}
            >
              <Options id={id} only={allowed} current={pick?.value} onPick={(v) => onChange(id, v)} label={name} />
              {means && <p className="text-[13px] leading-snug text-foreground/90">{i18n._(means)}</p>}
              {source === "ai" && why && (
                <p className="inline-flex gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
                  <Sparkles className="mt-0.5 size-3 shrink-0 text-brand-600" />
                  {i18n._(why)}
                </p>
              )}
              {locked.has(id) && (
                <p className="inline-flex gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
                  <Lock className="mt-0.5 size-3 shrink-0" />
                  <Trans>Can&apos;t be changed after the book is created.</Trans>
                </p>
              )}
              {(rec.settingEvidence[id]?.length ?? 0) > 0 && <PageStrip file={file} pages={rec.settingEvidence[id]!} label={t`Pages that show it`} />}
            </Row>
          )
        })}
        <Row id="chat-setting-range" label={<Trans>Page Range</Trans>} open={open === "range"} onToggle={() => toggle("range")} value={<span className="text-[14.5px] font-semibold">{scope}</span>}>
          <ScopeField />
        </Row>
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
        <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Lock className="size-3" />
          <Trans>Fixed once the book is created</Trans>
        </p>
        <button type="button" onClick={onAllSettings} className="-mr-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50">
          <Settings2 className="size-3.5" />
          <Trans>All settings</Trans>
        </button>
      </div>
    </div>
  )
  // How "all settings" opens: b6 inside the card that morphs, b8 to height: auto, b9 in a side canvas,
  // b10 as the ready card's second page; otherwise the usual collapse.
  const panel =
    idea === "b6" ? (
      expanded && all
    ) : idea === "b8" ? (
      <AutoHeight shown={expanded}>{all}</AutoHeight>
    ) : idea === "b10" ? (
      expanded && (
        <div key="change" className="ix-swap">
          {all}
        </div>
      )
    ) : idea === "b9" ? (
      <SideCanvas open={expanded && !frozen} onClose={() => setShownAll(false)} title={<Trans>Settings</Trans>}>
        {all}
      </SideCanvas>
    ) : (
      <Collapsible shown={expanded}>{all}</Collapsible>
    )
  const meta = (
    <>
      <span>{scope}</span>
      {changed === 0 ? (
        <span className={cn("inline-flex items-center gap-1 text-brand-700", living ? "font-medium" : "font-semibold")}>
          <Sparkles className="size-3" />
          <Trans>Picked by AI</Trans>
        </span>
      ) : (
        <span className="font-semibold text-foreground">
          <Plural value={changed} one="# changed by you" other="# changed by you" />
        </span>
      )}
    </>
  )
  // b6: the folded setup is one soft pill ("Story · … ›"); Change stretches that same surface into the panel.
  if (idea === "b6")
    return (
      <div inert={frozen}>
        {expanded ? (
          <div style={morphName("ix-settings")} className="ix-b6-surface rounded-[20px] px-4 pb-4 pt-3.5">
            <p className="text-[15.5px] font-semibold">
              <Trans>Settings</Trans>
            </p>
            {all}
            <button type="button" aria-expanded aria-controls="chat-settings-all" onClick={toggleAll} className="lc-btn mt-3 h-9 px-4 text-[13.5px]">
              <Trans>Done</Trans>
            </button>
          </div>
        ) : (
          <button type="button" aria-expanded={false} aria-controls="chat-settings-all" onClick={toggleAll} style={morphName("ix-settings")} className="ix-b6-surface group flex w-full items-center gap-3 rounded-[999px] py-2.5 pl-5 pr-4 text-left">
            <span className="min-w-0 flex-1">
              <span key={summary} className={cn("block truncate text-[15px] font-medium leading-snug", SWAP)}>
                {summary}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">{meta}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[13.5px] font-medium text-[var(--lc-accent-text)]">
              <Trans>Change</Trans>
              <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </span>
          </button>
        )}
      </div>
    )
  return (
    <div inert={frozen}>
      {idea === "b10" && ready && (
        // b10: the card's pages as the board's small step bars.
        <div aria-hidden className="mb-2.5 flex gap-1">
          <i className="h-1 w-5 rounded-full bg-[var(--lc-accent)]" />
          <i className={cn("h-1 w-5 rounded-full transition-colors duration-300", expanded ? "bg-[var(--lc-accent)]" : "bg-[var(--lc-line)]")} />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p key={summary} className={cn(living ? "text-[15.5px] font-medium leading-snug" : "text-[16px] font-bold leading-snug tracking-[-0.01em]", SWAP)}>
            {summary}
          </p>
          <p className={cn("mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground", living ? "text-[13.5px]" : "text-[12.5px]")}>{meta}</p>
        </div>
        <button type="button" aria-expanded={expanded} aria-controls="chat-settings-all" onClick={toggleAll} className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13.5px] text-brand-700 transition-colors hover:bg-brand-50", living ? "font-medium" : "font-semibold ring-1 ring-brand-200", idea === "b9" && expanded && "bg-brand-50 ring-brand-300")}>
          {expanded ? <Trans>Done</Trans> : <Trans>Change</Trans>}
          <ChevronDown className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")} />
        </button>
      </div>
      {panel}
    </div>
  )
}
