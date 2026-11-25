import { Plural, Trans, useLingui } from "@lingui/react/macro"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { SETTING_IDS } from "../../engine/answers"
import { FACT_SHORT, RULE_WHY, TEXT_LAYER } from "../../engine/words"
import { ClaimMark, useInlinePages } from "../livechat/ideas/evidence/ClaimMark"
import { PageBoxes, type BoxClaim } from "../livechat/ideas/evidence/PageBoxes"
import { SettingPill } from "./bubbles"
import { PageStrip } from "./Evidence"
import { useIdea } from "./ideas"
import { settingsWaitingOn, type Derived } from "./useAnswers"
import { Why } from "./Why"
import { useLiving } from "./look"
import { KIND_SAYS, plainTitle, SETTING_LABEL, valueTitle } from "./words"

// eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
const LEAD: SetupSettingId[] = ["preset", "renderStrategy", "pageGrouping"]

/** A setting as a pill, toned by where its value came from. */
export function Pill({ id, derived }: { id: SetupSettingId; derived: Derived }) {
  const { i18n } = useLingui()
  const living = useLiving()
  const value = derived.effective[id]?.value
  // Living chat: the value in plain words only ("Picture beside the words"), no setting name.
  if (living) {
    const plain = plainTitle(id, value)
    return <SettingPill value={plain ? i18n._(plain) : String(value)} tone={derived.source(id)} />
  }
  const title = valueTitle(id, value)
  return <SettingPill label={i18n._(SETTING_LABEL[id])} value={title ? i18n._(title) : String(value)} tone={derived.source(id)} />
}

/** The settings the engine settled without asking (no question hangs on them). */
export function settledSettings(rec: SetupRecommendation, derived: Derived): SetupSettingId[] {
  const waiting = settingsWaitingOn(rec, derived.asked, derived.proposed)
  return SETTING_IDS.filter((id) => !waiting.has(id))
}

/**
 * What the assistant found, in one breath: the kind of book and the main reason, at most three
 * settings as pills, and how many questions follow. Every reason, the scan note and the pages are
 * behind "Why?".
 */
export function Found({ rec, derived, file }: { rec: SetupRecommendation; derived: Derived; file: File | null | undefined }) {
  const { i18n } = useLingui()
  const settled = settledSettings(rec, derived)
  const genreAsked = derived.asked.some((f) => f.id === "genre")
  const chips = LEAD.filter((id) => settled.includes(id))
  const leadWhy = settled.includes("renderStrategy") ? RULE_WHY[rec.settings.renderStrategy?.rule ?? ""] : settled.includes("pageGrouping") ? RULE_WHY[rec.settings.pageGrouping?.rule ?? ""] : undefined
  const scan = rec.measured.textLayer !== "digital" ? TEXT_LAYER[rec.measured.textLayer] : null
  const pages = chips.flatMap((id) => rec.settingEvidence[id] ?? [])
  const count = derived.asked.length
  const idea = useIdea("evidence")
  const inline = useInlinePages()
  // The pages behind each claim: the kind of book, and the setting the main reason is about.
  const kindPages = rec.facts.find((f) => f.id === "genre")?.evidencePages ?? []
  const leadId: SetupSettingId | null = settled.includes("renderStrategy") ? "renderStrategy" : settled.includes("pageGrouping") ? "pageGrouping" : null
  const leadPages = leadId ? rec.settingEvidence[leadId] ?? [] : []
  const boxes: BoxClaim[] = []
  if (idea === "e22") {
    if (!genreAsked && kindPages[0]) boxes.push({ label: i18n._(FACT_SHORT.genre[derived.proposed.genre]!), page: kindPages[0] })
    // Then the main setting, or else the first settled one with pages, on a page not shown yet.
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
    <div className="flex flex-col gap-2">
      <p>
        {!genreAsked &&
          (inline ? (
            <>
              <strong className="font-semibold">{i18n._(KIND_SAYS[derived.proposed.genre]!)}</strong>
              <ClaimMark file={file} pages={kindPages} />{" "}
            </>
          ) : (
            <strong className="font-semibold">{i18n._(KIND_SAYS[derived.proposed.genre]!)} </strong>
          ))}
        {leadWhy ? i18n._(leadWhy) : <Trans>I&apos;ve read it.</Trans>}
        {leadWhy && <ClaimMark file={file} pages={leadPages} />}{" "}
        {!rec.secondOpinion && (
          <span className="text-amber-700 dark:text-amber-300">
            <Trans>Only one of my two readings came back, so give it a look.</Trans>{" "}
          </span>
        )}
        {count > 0 && (
          <span className="text-muted-foreground">
            <Plural value={count} one="One question first." other="# questions first." />
          </span>
        )}
      </p>
      {boxes.length > 0 && <PageBoxes file={file} claims={boxes} />}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((id) => (
            <Pill key={id} id={id} derived={derived} />
          ))}
        </div>
      )}
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
        <PageStrip file={file} pages={pages} />
      </Why>
    </div>
  )
}
