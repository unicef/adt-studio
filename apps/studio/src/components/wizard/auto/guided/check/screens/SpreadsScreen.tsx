/* eslint-disable lingui/no-unlocalized-strings -- setting ids and values, never shown */
import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Lock } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { RULE_WHY, SETTING_VALUE } from "../../../engine/words"
import { Illustration } from "../../shared/Illustration"
import { LookChoices, type LookOption } from "../../shared/PreviewChoices"
import { lookOf } from "../../shared/screens/look"
import { GROUPING_GUIDE, GROUPING_MORE } from "../../shared/optionGuide"
import { SpreadEvidence } from "./SpreadEvidence"
import type { Answers } from "../../shared/useAnswers"
import { PICTURE, SurePick } from "../SurePick"

type Props = { rec: SetupRecommendation; chat: Answers; file: File | null | undefined }

/** The pages that showed two-page pictures (the measured facing pairs, or the wide pages); none for a book of single pages. */
export function spreadPages(rec: SetupRecommendation): number[] {
  if (rec.measured.pageStorage === "single-pages") return []
  return rec.settingEvidence.pageGrouping?.length ? rec.settingEvidence.pageGrouping : rec.measured.pageStorageEvidence
}

/**
 * Screen · Facing pages (Page Grouping): whether each PDF page becomes its own screen or two facing
 * pages are joined into one, so a picture drawn across both stays whole. Measured from the PDF
 * (never asked), and fixed once the book is set up, so it gets its own screen: a picture of the
 * idea, the pick, the pages that showed it, and the user's own pages shown both ways.
 */
export function SpreadsScreen({ rec, chat, file }: Props) {
  const { i18n } = useLingui()
  const derived = chat.derived!
  const [open, setOpen] = useState(false)
  const value = derived.effective.pageGrouping?.value === "spread" ? "spread" : "single"
  const guess = derived.fromAnswers.pageGrouping?.value === "spread" ? "spread" : "single"
  const changed = derived.source("pageGrouping") === "changed"
  const rule = derived.fromAnswers.pageGrouping?.rule
  const evidence = spreadPages(rec)
  // The page to show them on: one the measure pointed at, else the book's preview page.
  const page = evidence[0] ?? rec.previewPage
  const labelId = "gd-spreads"
  const options = (["single", "spread"] as const).map(
    (v): LookOption => ({
      value: v,
      label: i18n._(SETTING_VALUE.pageGrouping[v]!.name),
      line: i18n._(SETTING_VALUE.pageGrouping[v]!.means),
      // The user's own pages, as one screen each or joined.
      look: lookOf({ ...derived.effective, pageGrouping: { value: v, rule: "user" } }),
      guess: v === guess,
      // The explanation dialog ("Explain the options"): what it does, when it fits, and why it was guessed.
      more: i18n._(GROUPING_MORE[v]!),
      guide: GROUPING_GUIDE[v],
      why: v === guess && rule && RULE_WHY[rule] ? i18n._(RULE_WHY[rule]!) : undefined,
    }),
  )
  return (
    <SurePick
      picture={
        <span className={`grid shrink-0 place-items-center p-3 ${PICTURE}`}>
          <Illustration key={value} name={`grouping-${value}`} />
        </span>
      }
      label={<Trans>Pictures across two pages</Trans>}
      title={i18n._(SETTING_VALUE.pageGrouping[value]!.name)}
      hint={i18n._(SETTING_VALUE.pageGrouping[value]!.means)}
      result={
        <span className="mt-1 flex flex-col gap-1.5">
          {evidence.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <Trans>Where I saw it:</Trans> <SpreadEvidence file={file} pages={evidence} rule={rule} />
            </span>
          )}
          <span className="flex items-start gap-2 text-muted-foreground">
            <Lock aria-hidden className="mt-[3px] size-3.5 shrink-0" />
            <Trans>Fixed once the book is set up: the pages are cut into screens when the book is made.</Trans>
          </span>
        </span>
      }
      changed={changed}
      labelId={labelId}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others
      othersLabel={<Trans>See your pages both ways</Trans>}
      hideLabel={<Trans>Hide your pages</Trans>}
    >
      <LookChoices rec={rec} options={options} page={page} chosen={value} onPick={(v) => chat.override("pageGrouping", v)} file={file} labelId={labelId} />
    </SurePick>
  )
}
