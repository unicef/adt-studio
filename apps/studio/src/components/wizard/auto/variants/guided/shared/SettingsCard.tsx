import { useState, type ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, Lock, Settings2, Sparkles } from "lucide-react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { ScopeField, useScopeSummary } from "../../../../core/fields/ScopeField"
import { SWAP } from "../../../../core/ui"
import { SETTING_IDS, strategiesFor } from "../../../engine/answers"
import { RULE_WHY, SETTING_VALUE } from "../../../engine/words"
import { SourceTag } from "../../../review/parts"
import { PageStrip } from "./Evidence"
import { useIdea } from "./ideaGroups"
import type { Derived, SettingValue } from "./useAnswers"
import { plainTitle, SETTING_LABEL, SETTING_OPTIONS, valueTitle } from "./words"

function Row({ label, value, tag, locked, open, onToggle, children, id }: { label: ReactNode; value: ReactNode; tag?: ReactNode; locked?: boolean; open: boolean; onToggle: () => void; children: ReactNode; id: string }) {
  const { t } = useLingui()
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
      <Collapsible shown={open}>
        <div id={`${id}-panel`} inert={!open} className="flex flex-col gap-2.5 px-3 pb-3 pt-0.5">
          {children}
        </div>
      </Collapsible>
    </li>
  )
}

function Options({ id, only, current, onPick, label }: { id: SetupSettingId; only: string[] | null; current: SettingValue | undefined; onPick: (v: SettingValue) => void; label: string }) {
  const { i18n } = useLingui()
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
            className={cn("inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium transition-[background-color,box-shadow,color,transform] duration-150 active:scale-[0.97]", on ? "bg-brand-600 text-primary-foreground" : "bg-[var(--lc-bubble)] text-foreground ring-1 ring-border hover:ring-brand-300")}
          >
            {i18n._(o.title)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The setup, folded to one line ("Storybook · Fixed Layout · Spread") with "Change". Opened, each
 * setting is a row in the wizard's names that says where its value came from (an answer or a change
 * by hand; the AI's are untagged), carries a lock when it can't change after creation, and opens to
 * chips with what the value means, why, and the pages. Page Range is the upload card's own choice.
 */
export function SettingsCard({ rec, derived, onChange, frozen, numPages, file, onAllSettings }: { rec: SetupRecommendation; derived: Derived; onChange: (id: SetupSettingId, value: SettingValue) => void; frozen: boolean; numPages: number; file: File | null | undefined; onAllSettings: () => void }) {
  const { i18n, t } = useLingui()
  const idea = useIdea("expand")
  const [expanded, setExpanded] = useState(false)
  const toggleAll = () => setExpanded(!expanded)
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
      // The setup in plain words ("Story · Picture beside the words · …").
      const plain = plainTitle(id, derived.effective[id]?.value)
      return plain ? i18n._(plain) : title(id)
    })
    .join(" · ")
  const all = (
    <div id="chat-settings-all" inert={!expanded} className="pt-2">
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
  // How "all settings" opens: b10 swaps it in (the height morph around it eases); otherwise the usual collapse.
  const panel =
    idea === "b10" ? (
      expanded && (
        <div key="change" className="ix-swap">
          {all}
        </div>
      )
    ) : (
      <Collapsible shown={expanded}>{all}</Collapsible>
    )
  const meta = (
    <>
      <span>{scope}</span>
      {changed === 0 ? (
        <span className="inline-flex items-center gap-1 font-medium text-brand-700">
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
  return (
    <div inert={frozen}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p key={summary} className={cn("text-[15.5px] font-medium leading-snug", SWAP)}>
            {summary}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground">{meta}</p>
        </div>
        <button type="button" aria-expanded={expanded} aria-controls="chat-settings-all" onClick={toggleAll} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13.5px] font-medium text-brand-700 transition-colors hover:bg-brand-50">
          {expanded ? <Trans>Done</Trans> : <Trans>Change</Trans>}
          <ChevronDown className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")} />
        </button>
      </div>
      {panel}
    </div>
  )
}
