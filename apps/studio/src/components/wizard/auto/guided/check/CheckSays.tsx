import { useStore } from "@tanstack/react-form"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { CircleHelp } from "lucide-react"
import { askExplain, useExplainable } from "../shared/explain"
import { useLanguageName } from "../shared/languageName"
import type { SetupRecommendation } from "@adt/types"
import { RULE_WHY, SETTING_VALUE } from "../../engine/words"
import { useWizardForm } from "../../../core/wizardForm"
import { useBookCreation } from "../../../core/useBookCreation"
import type { Derived } from "../shared/useAnswers"
import { Chip } from "../shared/bubbles"
import { ASK_WHY, KIND_SAYS } from "../shared/words"
import { LARGE_BOOK, screenFacts, type ScreenId } from "./screens"
import { useBookLanguage } from "./screens/LanguageScreen"

/**
 * The assistant's one line about the decision on screen: what it found and why (the rulebook's
 * reason), or why it asks. The first screen opens with the kind of book it found. On Pages it
 * suggests a few pages for a big book.
 */
type Props = { rec: SetupRecommendation; derived: Derived; screen: ScreenId; file: File | null | undefined; pageCount: number }

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
  const { found, picked, changed, variety } = useBookLanguage(rec)
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
  if (variety && picked) {
    const chosen = nameOf(picked)
    return (
      <p>
        <Trans>
          <strong className="font-semibold">Your book is in {name}.</strong> I&apos;ll make it in {chosen}, without translating it.
        </Trans>
      </p>
    )
  }
  return (
    <p>
      <Trans>
        <strong className="font-semibold">Your book is in {name}.</strong> I&apos;ll keep it in {name}.
      </Trans>
    </p>
  )
}

function Says({ rec, derived, screen, file, pageCount }: Props) {
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
    // A layout the user picked by hand: say so, and what it does (the reason was for the guess).
    const layout = SETTING_VALUE.renderStrategy[String(derived.effective.renderStrategy?.value)]
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a source id, never shown
    if (derived.source("renderStrategy") === "changed" && layout) {
      const name = i18n._(layout.name)
      return (
        <p>
          <Trans>
            <strong className="font-semibold">Your pick: {name}.</strong> I&apos;ll make every page this way.
          </Trans>
        </p>
      )
    }
    return <p>{ask ? i18n._(ask) : why(derived.fromAnswers.renderStrategy?.rule)}</p>
  }
  if (screen === "spreads") return <SpreadsSays derived={derived} />
  if (screen === "pages") return <PagesSays pageCount={pageCount} />
  if (screen === "activities") {
    const facts = screenFacts(rec, derived.current, "activities").map((f) => f.id)
    const rule = facts.includes("exercises") ? derived.fromAnswers.activitiesGenerator?.rule : derived.fromAnswers.figureExtraction?.rule
    return <p>{ask ? i18n._(ask) : why(rule)}</p>
  }
  return <NameSays />
}

/** Name and set up: what happens after (the conversion starts here unless the book is split or no AI provider is set up). */
function NameSays() {
  const form = useWizardForm()
  const values = useStore(form.store, (s) => s.values)
  const { willExtract } = useBookCreation()
  return (
    <p>
      {willExtract(values) ? (
        <Trans>
          <strong className="font-semibold">That&apos;s the setup.</strong> Give the book a name and I&apos;ll set it up; the conversion starts after that.
        </Trans>
      ) : values.scope === "split" ? (
        <Trans>
          <strong className="font-semibold">That&apos;s the setup.</strong> Give the book a name and I&apos;ll set it up; with Split, each person converts their own pages.
        </Trans>
      ) : (
        <Trans>
          <strong className="font-semibold">That&apos;s the setup.</strong> Give the book a name and I&apos;ll set it up; you start the conversion from the book page once an AI provider is set up.
        </Trans>
      )}
    </p>
  )
}

/** Pages: the pages chosen now (every page, a range, or split into parts); for a big book, a nudge to start with a few. */
function PagesSays({ pageCount }: { pageCount: number }) {
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = Math.max(1, parseInt(useStore(form.store, (s) => s.values.startPage)) || 1)
  const end = Math.min(pageCount, parseInt(useStore(form.store, (s) => s.values.endPage)) || pageCount)
  if (scope === "split")
    return (
      <p>
        <Trans>
          <strong className="font-semibold">Split into parts.</strong> The book is set up without converting it, so each person can convert their own pages.
        </Trans>
      </p>
    )
  if (scope === "range" && (start > 1 || end < pageCount)) {
    const count = end - start + 1
    return (
      <p>
        <strong className="font-semibold">{start === end ? <Trans>Page {start} is selected.</Trans> : <Trans>Pages {start}–{end} are selected.</Trans>}</strong>{" "}
        <Plural value={count} one="Only that page is converted." other="Only those # pages are converted." />
      </p>
    )
  }
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
      <Plural value={pageCount} one="Pick the pages to convert. The only page is selected." other="Pick the pages to convert. All # are selected." />
    </p>
  )
}

/** Facing pages: what the PDF showed (pictures across two pages, two-page openings, wide pages, or none), and so what happens to its pages. The pages that showed it are on the screen. */
function SpreadsSays({ derived }: { derived: Derived }) {
  const rule = derived.fromAnswers.pageGrouping?.rule
  const joined = derived.effective.pageGrouping?.value === "spread"
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a rule id or setting value, never shown
  if (derived.source("pageGrouping") === "changed")
    return (
      <p>
        {joined ? (
          <Trans>
            <strong className="font-semibold">Your pick: facing pages joined.</strong> Each pair of pages becomes one wide screen. Pages that don&apos;t belong together are joined too.
          </Trans>
        ) : (
          <Trans>
            <strong className="font-semibold">Your pick: one page per screen.</strong> A picture drawn across two pages will be cut in two.
          </Trans>
        )}
      </p>
    )
  if (rule === "group-joined-spreads")
    return (
      <p>
        <Trans>
          <strong className="font-semibold">Some pictures run across two pages.</strong> So I&apos;ll join each pair of facing pages into one screen, and those pictures stay whole.
        </Trans>
      </p>
    )
  if (rule === "group-facing-pages")
    return (
      <p>
        <Trans>
          <strong className="font-semibold">Your book is laid out in pairs:</strong> a page of words faces a page of picture. So I&apos;ll keep each pair together on one screen.
        </Trans>
      </p>
    )
  if (rule === "group-wide-pages")
    return (
      <p>
        <Trans>
          <strong className="font-semibold">Your PDF already has facing pages side by side</strong> on one wide page, so each one stays one screen. Nothing needs joining.
        </Trans>
      </p>
    )
  return (
    <p>
      <Trans>
        <strong className="font-semibold">Each page stands on its own.</strong> I didn&apos;t find pictures running across two pages, so every PDF page becomes one screen.
      </Trans>
    </p>
  )
}
