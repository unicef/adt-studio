import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { RULE_WHY } from "../../engine/words"
import { Citation } from "../shared/Citation"
import type { Derived } from "../shared/useAnswers"
import { ASK_WHY, KIND_SAYS } from "../shared/words"
import { defaultPageRange, screenFacts, type ScreenId } from "./screens"

/**
 * The assistant's one line about the decision on screen: what it found and why (the rulebook's
 * reason), or why it asks. The first screen opens with the kind of book it found.
 */
export function CheckSays({ rec, derived, screen, file, pageCount }: { rec: SetupRecommendation; derived: Derived; screen: ScreenId; file: File | null | undefined; pageCount: number }) {
  const { i18n } = useLingui()
  const asked = screenFacts(rec, derived.current, screen).find((f) => f.ask)
  const ask = asked?.askReason ? ASK_WHY[asked.askReason] : undefined
  const why = (rule: string | undefined) => (rule && RULE_WHY[rule] ? i18n._(RULE_WHY[rule]!) : null)

  if (screen === "kind") {
    const genre = rec.facts.find((f) => f.id === "genre")
    return (
      <p>
        {asked ? (
          <>
            <strong className="font-semibold">
              <Trans>I&apos;ve read your book.</Trans>
            </strong>{" "}
            {ask ? i18n._(ask) : <Trans>Tell me what kind of book it is.</Trans>}
          </>
        ) : (
          <>
            <strong className="font-semibold">{i18n._(KIND_SAYS[derived.proposed.genre]!)}</strong>
            <Citation file={file} pages={genre?.evidencePages ?? []} /> {why(rec.settings.preset?.rule)}
          </>
        )}{" "}
        {!rec.secondOpinion && (
          <span className="text-amber-700 dark:text-amber-300">
            <Trans>Only one of my two readings came back, so give it a look.</Trans>
          </span>
        )}
      </p>
    )
  }
  if (screen === "look") {
    return (
      <p>
        {ask ? i18n._(ask) : why(derived.fromAnswers.renderStrategy?.rule)}
        {!ask && <Citation file={file} pages={rec.settingEvidence.renderStrategy ?? []} />}
      </p>
    )
  }
  if (screen === "pages") {
    const range = defaultPageRange(rec, pageCount)
    return (
      <p>
        {range.scope === "whole" ? (
          <Trans>I&apos;d import all {pageCount} pages.</Trans>
        ) : (
          <Trans>
            I&apos;d import pages {range.start}–{range.end}: the book itself, without the pages around it.
          </Trans>
        )}
      </p>
    )
  }
  if (screen === "activities") {
    const facts = screenFacts(rec, derived.current, "activities").map((f) => f.id)
    const rule = facts.includes("exercises") ? derived.fromAnswers.activitiesGenerator?.rule : derived.fromAnswers.figureExtraction?.rule
    return <p>{ask ? i18n._(ask) : why(rule)}</p>
  }
  return (
    <p>
      <Trans>
        <strong className="font-semibold">That&apos;s everything.</strong> Give the book a name and I&apos;ll create it.
      </Trans>
    </p>
  )
}
