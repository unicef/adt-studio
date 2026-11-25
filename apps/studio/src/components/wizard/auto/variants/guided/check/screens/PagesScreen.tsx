import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { PageThumb, ScopeField } from "../../../../../core/fields/ScopeField"
import { useWizardForm } from "../../../../../core/wizardForm"
import { defaultPageRange, skippedPages } from "../screens"
import { SurePick } from "../SurePick"

/** What the engine left out, in a line: "I left out the opening pages (2–7) and the end pages (50–52)." */
function Skipped({ rec, pageCount }: { rec: SetupRecommendation; pageCount: number }) {
  const { t } = useLingui()
  const parts = skippedPages(rec, pageCount).map((s) => {
    const pages = s.from === s.to ? String(s.from) : `${s.from}–${s.to}`
    return s.why === "opening" ? t`the opening pages (${pages})` : t`the end pages (${pages})`
  })
  if (!parts.length) return <Trans>Nothing to leave out: every page is part of the book.</Trans>
  const list = parts.join(t` and `)
  return <Trans>I left out {list}.</Trans>
}

/**
 * Screen 3 · Pages to import: the engine's range (opening and end pages left out), shown as its
 * first and last page, with the wizard's own page picker under "Choose other pages". The range
 * lives in the wizard form, where creating the book and the step-by-step wizard read it.
 */
export function PagesScreen({ rec, pageCount }: { rec: SetupRecommendation; pageCount: number }) {
  const form = useWizardForm()
  const [open, setOpen] = useState(false)
  const file = useStore(form.store, (s) => s.values.file)
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || pageCount
  const all = scope === "whole" || (start <= 1 && end >= pageCount)
  const first = scope === "range" ? start : 1
  const last = scope === "range" ? end : pageCount
  const suggested = defaultPageRange(rec, pageCount)
  const changed = scope === "split" || (all ? suggested.scope !== "whole" : suggested.scope === "whole" || start !== suggested.start || end !== suggested.end)
  return (
    <SurePick
      picture={
        <span className="qd18-pv flex h-[150px] w-full shrink-0 items-center justify-center gap-3 rounded-[12px] sm:w-[240px]">
          <PageThumb file={file} page={first} />
          <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
          <PageThumb file={file} page={last} />
        </span>
      }
      label={<Trans>Pages to import</Trans>}
      title={scope === "split" ? <Trans>Split into parts</Trans> : all ? <Trans>All {pageCount} pages</Trans> : <Trans>Pages {start}–{end}</Trans>}
      hint={changed ? <Trans>Your choice of pages.</Trans> : <Skipped rec={rec} pageCount={pageCount} />}
      changed={changed}
      labelId="gd-pages"
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others
      othersLabel={<Trans>Choose other pages</Trans>}
    >
      <div className="rounded-[14px] bg-[var(--lc-bubble)] p-3">
        <ScopeField />
      </div>
    </SurePick>
  )
}
