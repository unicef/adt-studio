import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, Lock, Settings2, Sparkles } from "lucide-react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { useScopeSummary } from "../../../core/fields/ScopeField"
import { SWAP } from "../../../core/ui"
import { SETTING_IDS } from "../../engine/answers"
import { RULE_WHY, SETTING_VALUE } from "../../engine/words"
import { SourceTag } from "../../review/parts"
import { PageStrip } from "./Evidence"
import { strategiesFor, type Derived, type SettingValue } from "./useAnswers"
import { SETTING_LABEL, SETTING_OPTIONS, valueTitle } from "./words"

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
            className={cn("inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,box-shadow,color,transform] duration-150 active:scale-[0.97]", on ? "bg-brand-600 text-primary-foreground shadow-[0_6px_16px_-8px_rgba(43,127,255,0.9)]" : "bg-card text-foreground ring-1 ring-border hover:ring-brand-300")}
          >
            {i18n._(o.title)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The whole setup as one card in the thread, in the wizard's names. Each row says where its value
 * came from (the AI, an answer, or a change by hand; the AI's are the default and untagged) and
 * opens to change it with chips, with what the value means, why it was picked and the pages that
 * show it. Settings that can't change after creation carry a lock.
 */
export function SettingsCard({ rec, derived, onChange, frozen, numPages, file, onEditScope, onAllSettings }: { rec: SetupRecommendation; derived: Derived; onChange: (id: SetupSettingId, value: SettingValue) => void; frozen: boolean; numPages: number; file: File | null | undefined; onEditScope: () => void; onAllSettings: () => void }) {
  const { i18n, t } = useLingui()
  const [open, setOpen] = useState<string | null>(null)
  const scope = useScopeSummary(numPages)
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key))
  const fromAi = SETTING_IDS.filter((id) => derived.source(id) === "ai").length
  const locked = new Set(rec.lockedSettings)
  return (
    <div inert={frozen} className="w-full rounded-[22px] bg-card/95 p-1.5 ring-1 ring-border shadow-[0_18px_44px_-26px_rgba(15,23,42,0.5)] backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2.5">
        <p className="text-[15px] font-bold tracking-[-0.01em]">
          <Trans>Your setup</Trans>
        </p>
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 ring-1 ring-brand-200">
          <Sparkles className="size-3" />
          {fromAi === SETTING_IDS.length ? <Trans>Picked by AI</Trans> : <Trans>{fromAi} of {SETTING_IDS.length} picked by AI</Trans>}
        </span>
      </div>
      <ul className="flex flex-col">
        {SETTING_IDS.map((id) => {
          const pick = derived.effective[id]
          const title = valueTitle(id, pick?.value)
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
                  {title ? i18n._(title) : String(pick?.value)}
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
                  <Trans>This one can&apos;t be changed after the book is created.</Trans>
                </p>
              )}
              {(rec.settingEvidence[id]?.length ?? 0) > 0 && <PageStrip file={file} pages={rec.settingEvidence[id]!} label={t`Pages that show it`} />}
            </Row>
          )
        })}
        <li className="flex items-center gap-2 rounded-[16px] px-3 py-2.5">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 text-[13px] text-muted-foreground sm:w-[150px]">
              <Trans>Page Range</Trans>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[14.5px] font-semibold">{scope}</span>
              <SourceTag source="asked" />
            </span>
          </span>
          <button type="button" onClick={onEditScope} className="shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50">
            <Trans>Change</Trans>
          </button>
        </li>
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-3 pb-1.5 pt-2.5">
        <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Lock className="size-3" />
          <Trans>Fixed once the book is created</Trans>
        </p>
        <button type="button" onClick={onAllSettings} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50">
          <Settings2 className="size-3.5" />
          <Trans>All settings</Trans>
        </button>
      </div>
    </div>
  )
}
