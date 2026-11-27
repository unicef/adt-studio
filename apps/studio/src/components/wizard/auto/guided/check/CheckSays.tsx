import { Trans, useLingui } from "@lingui/react/macro"
import { CircleHelp } from "lucide-react"
import { askExplain, useExplainable } from "../shared/explain"
import { useLanguageName } from "../shared/languageName"
import type { SetupRecommendation } from "@adt/types"
import { RULE_WHY } from "../../engine/words"
import type { Derived } from "../shared/useAnswers"
import { Chip } from "../shared/bubbles"
import { ASK_WHY, KIND_SAYS } from "../shared/words"
import { LARGE_BOOK, screenFacts, type ScreenId } from "./screens"
import { useBookLanguage } from "./screens/LanguageScreen"

/**
 * The assistant's one line about the decision on screen: what it found and why (the rulebook's
 * reason), or why it asks. The first screen opens with the kind of book it found. On Pages it
 * asks a first-time user whether they're just trying it out.
 */
type Props = { rec: SetupRecommendation; derived: Derived; screen: ScreenId; file: File | null | undefined; pageCount: number; firstBook: boolean; trying: boolean | null; onTrying: (trying: boolean) => void }

export function CheckSays(props: Props) {
  return (
    <>
      {props.screen === "language" ? <LanguageSays rec={props.rec} /> : <Says {...props} />}
      <ExplainOffer />
    </>
  )
}

/** The assistant offers to explain what's on screen (the options, or how languages work): a line and a button. */
function ExplainOffer() {
  const what = useExplainable()
  if (!what) return null
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground">
      <span>{what === "languages" ? <Trans>Not sure what this changes?</Trans> : <Trans>Not sure which one fits your book?</Trans>}</span>
      <Chip onClick={askExplain} icon={<CircleHelp className="size-4" />} className="h-9 px-3.5 text-[13.5px]">
        {what === "languages" ? <Trans>How languages work</Trans> : <Trans>Explain the options</Trans>}
      </Chip>
    </p>
  )
}

function LanguageSays({ rec }: { rec: SetupRecommendation }) {
  const { found, picked, changed } = useBookLanguage(rec)
  const nameOf = useLanguageName()
  if (changed && picked) {
    const name = nameOf(picked)
    return (
      <p>
        <Trans>I&apos;ll translate the text into {name}.</Trans>
      </p>
    )
  }
  if (!found)
    return (
      <p>
        <Trans>I couldn&apos;t tell the book&apos;s language from the PDF, so I&apos;ll keep whatever language it&apos;s in.</Trans>
      </p>
    )
  const name = nameOf(found)
  return (
    <p>
      <Trans>
        <strong className="font-semibold">Your book is in {name}.</strong> I&apos;ll keep it in {name}.
      </Trans>
    </p>
  )
}

function Says({ rec, derived, screen, file, pageCount, firstBook, trying, onTrying }: Props) {
  const { i18n } = useLingui()
  const asked = screenFacts(rec, derived.current, screen).find((f) => f.ask)
  const ask = asked?.askReason ? ASK_WHY[asked.askReason] : undefined
  const why = (rule: string | undefined) => (rule && RULE_WHY[rule] ? i18n._(RULE_WHY[rule]!) : null)

  if (screen === "kind") {
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
            <strong className="font-semibold">{i18n._(KIND_SAYS[derived.proposed.genre]!)}</strong> {why(rec.settings.preset?.rule)}
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
      </p>
    )
  }
  if (screen === "pages") {
    if (firstBook && trying === null)
      return (
        <div className="flex flex-col gap-3">
          <p>
            <Trans>
              <strong className="font-semibold">Is this your first book?</strong> If you&apos;re just trying ADT Studio, I&apos;ll suggest a few pages so it&apos;s quick. If you want the whole book, we keep all its pages.
            </Trans>
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip onClick={() => onTrying(true)}>
              <Trans>Just trying: a few pages</Trans>
            </Chip>
            <Chip onClick={() => onTrying(false)}>
              <Trans>I want the whole book</Trans>
            </Chip>
          </div>
        </div>
      )
    if (trying)
      return (
        <p>
          <Trans>
            <strong className="font-semibold">Then a few pages are enough.</strong> Pick 5 to 10 pages below to see how the book comes out. Converting all of them takes longer and costs more.
          </Trans>
        </p>
      )
    if (pageCount > LARGE_BOOK)
      return (
        <p>
          <Trans>
            <strong className="font-semibold">This is a big book: {pageCount} pages.</strong> Converting all of them takes a while and uses more of your AI credit, so you may want to start with a few.
          </Trans>
        </p>
      )
    return (
      <p>
        <Trans>Pick the pages to convert. All {pageCount} are selected.</Trans>
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
        <strong className="font-semibold">That&apos;s the setup.</strong> Give the book a name and I&apos;ll set it up; the conversion starts after that.
      </Trans>
    </p>
  )
}
