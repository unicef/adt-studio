import { useEffect, useId, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown } from "lucide-react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { useReducedEffects } from "@/lib/effects"
import { cn } from "@/lib/utils"
import type { Derived } from "../../../chat/useAnswers"
import { plainTitle } from "../../../chat/words"
import { SETTING_NAME } from "../../../../engine/words"
import "./evidence.css"

// eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
const SHOWN: SetupSettingId[] = ["renderStrategy", "pageGrouping"]

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-[var(--lc-line)] py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-foreground">{children}</dd>
    </div>
  )
}

/**
 * What the reading checked, as one tool-call row: a spinner that turns into a check, "Checked the
 * layout", and the measured facts and the layout settings folded underneath.
 */
export function ToolCard({ rec, derived }: { rec: SetupRecommendation; derived: Derived }) {
  const { t, i18n } = useLingui()
  const reduced = useReducedEffects()
  const [done, setDone] = useState(reduced)
  const [open, setOpen] = useState(false)
  const id = useId()
  useEffect(() => {
    if (done) return
    const timer = window.setTimeout(() => setDone(true), 900)
    return () => window.clearTimeout(timer)
  }, [done])
  const m = rec.measured
  let language = m.language
  try {
    if (m.language) language = new Intl.DisplayNames([i18n.locale], { type: "language" }).of(m.language) ?? m.language
  } catch {
    /* unknown code: show it as is */
  }
  const text = m.textLayer === "digital" ? t`Real text` : m.textLayer === "mixed" ? t`Text and scans` : m.textLayer === "scanned-with-ocr" ? t`Scan with hidden text` : t`Scan`
  return (
    <div className={cn("ev-tool lc-surface w-full max-w-[400px] overflow-hidden !rounded-[14px] text-[13.5px]", done && "is-done")}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--lc-stage)]">
        <span className="ev-tool-state relative grid size-4 shrink-0 place-items-center" aria-hidden>
          <span className="ev-tool-spin absolute size-3.5 rounded-full border-2 border-brand-600/25 border-t-brand-600 motion-safe:animate-spin" />
          <Check className="ev-tool-check absolute size-4 stroke-[2.6] text-emerald-500" />
        </span>
        <span className="min-w-0 flex-1 font-medium">{done ? <Trans>Checked the layout</Trans> : <Trans>Checking the layout…</Trans>}</span>
        <span className="font-mono text-[11.5px] text-muted-foreground">{((rec.timings.totalMs ?? 0) / 1000).toFixed(1)}s</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <div className="ev-tool-det" data-open={open}>
        <div>
          <dl id={id} inert={!open} className="px-3.5 pb-2.5">
            <Row label={<Trans>Pages</Trans>}>{rec.pageCount}</Row>
            <Row label={<Trans>Text</Trans>}>{text}</Row>
            {language && <Row label={<Trans>Language</Trans>}>{language}</Row>}
            <Row label={<Trans>Facing pages</Trans>}>{m.facingPairs}</Row>
            <Row label={<Trans>Readings</Trans>}>{rec.secondOpinion ? <Trans>2 of 2</Trans> : <Trans>1 of 2</Trans>}</Row>
            {SHOWN.map((s) => {
              const title = plainTitle(s, derived.effective[s]?.value)
              return (
                <Row key={s} label={i18n._(SETTING_NAME[s])}>
                  {title ? i18n._(title) : String(derived.effective[s]?.value)}
                </Row>
              )
            })}
          </dl>
        </div>
      </div>
    </div>
  )
}
