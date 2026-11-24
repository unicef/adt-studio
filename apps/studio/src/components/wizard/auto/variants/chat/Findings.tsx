import type { ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { RULE_WHY, TEXT_LAYER } from "../../engine/words"
import { SettingPill } from "./bubbles"
import { PageStrip } from "./Evidence"
import type { Derived } from "./useAnswers"
import { KIND_SAYS, SETTING_LABEL, valueTitle } from "./words"

/** A setting as a pill, toned by where its value came from. */
export function Pill({ id, derived }: { id: SetupSettingId; derived: Derived }) {
  const { i18n } = useLingui()
  const value = derived.effective[id]?.value
  const title = valueTitle(id, value)
  return <SettingPill label={i18n._(SETTING_LABEL[id])} value={title ? i18n._(title) : String(value)} tone={derived.source(id)} />
}

function Finding({ text, pills, pages, file }: { text: ReactNode; pills: ReactNode; pages: number[]; file: File | null | undefined }) {
  return (
    <div className="flex flex-col gap-2">
      <p>{text}</p>
      <div className="flex flex-wrap gap-1.5">{pills}</div>
      <PageStrip file={file} pages={pages} className="-mb-0.5" />
    </div>
  )
}

/** "It's a story." The kind of book and the preset it leads to. */
export function KindFinding({ rec, derived, file }: { rec: SetupRecommendation; derived: Derived; file: File | null | undefined }) {
  const { i18n } = useLingui()
  const genre = derived.proposed.genre
  const why = RULE_WHY[rec.settings.preset?.rule ?? ""]
  return (
    <Finding
      file={file}
      text={
        <>
          <strong className="font-semibold">{i18n._(KIND_SAYS[genre]!)}</strong> {why && i18n._(why)}
        </>
      }
      pills={<Pill id="preset" derived={derived} />}
      pages={rec.settingEvidence.preset ?? []}
    />
  )
}

/** How the PDF's pages are stored and whether it has real text: Page Grouping, and a scan's note. */
export function PagesFinding({ rec, derived, file }: { rec: SetupRecommendation; derived: Derived; file: File | null | undefined }) {
  const { i18n } = useLingui()
  const why = RULE_WHY[rec.settings.pageGrouping?.rule ?? ""]
  const scan = rec.measured.textLayer !== "digital" ? TEXT_LAYER[rec.measured.textLayer] : null
  const pages = [...(rec.settingEvidence.pageGrouping ?? []), ...rec.measured.pageStorageEvidence, ...(scan ? rec.measured.textLayerEvidence : [])]
  return <Finding file={file} text={<>{why && i18n._(why)} {scan && i18n._(scan)}</>} pills={<Pill id="pageGrouping" derived={derived} />} pages={pages} />
}

/** Where the words sit and so how pages are rebuilt: Render Strategy. */
export function LookFinding({ rec, derived, file }: { rec: SetupRecommendation; derived: Derived; file: File | null | undefined }) {
  const { i18n } = useLingui()
  const why = RULE_WHY[rec.settings.renderStrategy?.rule ?? ""]
  return <Finding file={file} text={why ? i18n._(why) : null} pills={<Pill id="renderStrategy" derived={derived} />} pages={rec.settingEvidence.renderStrategy ?? []} />
}

/** Everything else in one breath, as pills: the reasons are one tap away in the setup card. */
export function RestFinding({ ids, derived }: { ids: SetupSettingId[]; derived: Derived }) {
  return (
    <div className="flex flex-col gap-2">
      <p>
        <Trans>And the rest follows from that:</Trans>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <Pill key={id} id={id} derived={derived} />
        ))}
      </div>
    </div>
  )
}

/** What's left to ask, or that there's nothing to ask. */
export function AskIntro({ count }: { count: number }) {
  if (count === 0)
    return (
      <Trans>
        <strong className="font-semibold">I&apos;m sure about all of it,</strong> so there&apos;s nothing to ask you.
      </Trans>
    )
  return <Plural value={count} one="There's one thing I'm not sure about." other="There are # things I'm not sure about. One at a time:" />
}
