import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { rightSummary } from "../NoiseToggle"
import type { BannerModel } from "./bannerModel"

export function useBannerCopy(model: BannerModel) {
  const { t, i18n } = useLingui()
  const { counts, steps, reviewed, session, filtered } = model
  const worth = counts.needed + counts.look
  const kinds = rightSummary((descriptor) => i18n._(descriptor), model.rightKinds)
  const opinion = model.ai.opinion
  const tally = { keep: 0, unsure: 0, remove: 0 }
  for (const item of model.ai.scope) {
    const answer = opinion.opinionOf(item)
    if (answer) tally[answer.verdict]++
  }
  const asked = tally.keep + tally.unsure + tally.remove
  const progress = opinion.progress
  const allFine = !model.loading && worth === 0
  const state = allFine ? "fine" : session.finished ? "finished" : session.started && reviewed > 0 ? "progress" : "new"
  return {
    state,
    worth,
    kinds,
    tally,
    asked,
    allFine,
    reviewLabel:
      state === "progress" ? t`Continue` : t`${plural(model.pages, { one: "Check # page", other: "Check # pages" })}`,
    progressText: t`${reviewed} of ${steps} checked`,
    finishedText: t`${plural(session.back, { one: "You brought back # picture", other: "You brought back # pictures" })}, ${plural(session.kept, { one: "# stays out", other: "# stay out" })}.`,
    fineText: t`${plural(filtered, { one: "# picture was left out and looks right to leave out.", other: "All # left-out pictures look right to leave out." })}`,
    headline:
      t`${plural(worth, { one: "# left-out picture could matter to the book", other: "# left-out pictures could matter to the book" })}`,
    aiStatus: opinion.running && progress
      ? t`AI is taking a second look, ${progress.done} of ${progress.total}.`
      : asked > 0
        ? t`AI suggests bringing back ${tally.keep}, is unsure about ${tally.unsure}, and thinks ${tally.remove} are fine to leave out.`
        : null,
    aiAction: opinion.running ? t`Show progress` : asked > 0 && asked < model.ai.scope.length ? t`Ask about the rest` : asked > 0 ? null : t`AI second look`,
    showAllLabel: model.showAll ? t`Only the ones worth checking` : t`Show all ${filtered}`,
  }
}

export type BannerCopy = ReturnType<typeof useBannerCopy>
