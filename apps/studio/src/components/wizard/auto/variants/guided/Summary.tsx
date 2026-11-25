import { Plural, Trans, useLingui } from "@lingui/react/macro"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { FACT_SHORT, RULE_WHY, TEXT_LAYER } from "../../engine/words"
import { ClaimMark } from "./shared/ideas/evidence/ClaimMark"
import { PageBoxes, type BoxClaim } from "./shared/ideas/evidence/PageBoxes"
import { PageStrip } from "./shared/Evidence"
import { settledSettings, type Derived } from "./shared/useAnswers"
import { Why } from "./shared/Why"
import { KIND_SAYS, SETTING_LABEL, valueTitle } from "./shared/words"
import { useGuidedIdea } from "./ideas"

/**
 * The Check step's bubble: what the assistant found in one breath (the kind of book and the main
 * reason, each with the pages that show it), then what's left: the questions below, or nothing.
 * Every reason, the scan note and the pages are behind "Why?".
 */
export function Summary({ rec, derived, file, left }: { rec: SetupRecommendation; derived: Derived; file: File | null | undefined; left: number }) {
  const { i18n } = useLingui()
  const evidence = useGuidedIdea("evidence")
  const settled = settledSettings(rec, derived)
  const genreAsked = derived.asked.some((f) => f.id === "genre")
  const leadId: SetupSettingId | null = settled.includes("renderStrategy") ? "renderStrategy" : settled.includes("pageGrouping") ? "pageGrouping" : null
  const leadWhy = leadId ? RULE_WHY[rec.settings[leadId]?.rule ?? ""] : undefined
  const kindPages = rec.facts.find((f) => f.id === "genre")?.evidencePages ?? []
  const leadPages = leadId ? (rec.settingEvidence[leadId] ?? []) : []
  const scan = rec.measured.textLayer !== "digital" ? TEXT_LAYER[rec.measured.textLayer] : null
  const asked = derived.asked.length

  // e22: the claims drawn as boxes on the pages that show them.
  const boxes: BoxClaim[] = []
  if (evidence === "e22") {
    if (!genreAsked && kindPages[0]) boxes.push({ label: i18n._(FACT_SHORT.genre[derived.proposed.genre]!), page: kindPages[0] })
    for (const id of [...(leadId ? [leadId] : []), ...settled.filter((s) => s !== leadId)]) {
      const title = valueTitle(id, derived.effective[id]?.value)
      const page = (rec.settingEvidence[id] ?? []).find((p) => !boxes.some((b) => b.page === p))
      if (title && page) {
        boxes.push({ label: `${i18n._(SETTING_LABEL[id])}: ${i18n._(title)}`, page })
        break
      }
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p>
        {!genreAsked && (
          <>
            <strong className="font-semibold">{i18n._(KIND_SAYS[derived.proposed.genre]!)}</strong>
            <ClaimMark file={file} pages={kindPages} />{" "}
          </>
        )}
        {leadWhy ? i18n._(leadWhy) : <Trans>I&apos;ve read it.</Trans>}
        {leadWhy && <ClaimMark file={file} pages={leadPages} />}{" "}
        {!rec.secondOpinion && (
          <span className="text-amber-700 dark:text-amber-300">
            <Trans>Only one of my two readings came back, so give it a look.</Trans>{" "}
          </span>
        )}
        <span className="text-muted-foreground">
          {left > 0 ? (
            <Plural value={left} one="One question below." other="# questions below." />
          ) : asked > 0 ? (
            <Trans>Thanks, that settles it. Here&apos;s the setup.</Trans>
          ) : (
            <Trans>Nothing to ask. Here&apos;s the setup.</Trans>
          )}
        </span>
      </p>
      {boxes.length > 0 && <PageBoxes file={file} claims={boxes} />}
      <Why>
        <ul className="flex flex-col gap-1">
          {settled.map((id) => {
            const why = RULE_WHY[rec.settings[id]?.rule ?? ""]
            const title = valueTitle(id, derived.effective[id]?.value)
            return (
              <li key={id}>
                <span className="font-semibold text-foreground">
                  {i18n._(SETTING_LABEL[id])}: {title ? i18n._(title) : ""}.
                </span>{" "}
                {why && i18n._(why)}
              </li>
            )
          })}
        </ul>
        {scan && <p>{i18n._(scan)}</p>}
        <PageStrip file={file} pages={[...kindPages, ...leadPages]} />
      </Why>
    </div>
  )
}
