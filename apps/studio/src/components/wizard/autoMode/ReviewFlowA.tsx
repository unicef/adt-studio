import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useStore } from "@tanstack/react-form"
import { ArrowLeft, Loader2, SlidersHorizontal, Zap } from "lucide-react"
import { setupFactsKey, type SetupBookFactId, type SetupRecommendation, type SetupSettingId } from "@adt/types"
import { Button } from "@/components/ui/button"
import { useBooks } from "@/hooks/use-books"
import { useWizardForm } from "../wizardForm"
import { ProjectNameField } from "../step1BasicInfo/ProjectNameField"
import { createProjectLabelSchema, isStep1BasicInfoValid } from "../step1BasicInfo/projectLabelSchema"
import { AskCard } from "./AskCard"
import { PickRow } from "./PickRow"
import { usePdfPageImages } from "./usePdfPageImages"
import { FACT_SHORT, RULE_WHY, SETTING_NAME, SETTING_VALUE, TEXT_LAYER } from "./words"

/* eslint-disable lingui/no-unlocalized-strings -- setting ids, not text */
const SETTING_ORDER: SetupSettingId[] = [
  "preset",
  "renderStrategy",
  "pageGrouping",
  "figureExtraction",
  "activitiesGenerator",
  "sectioningMode",
]
/* eslint-enable lingui/no-unlocalized-strings */

/**
 * Flow A, "sure / not sure": a real page at the top, then the questions the
 * AI couldn't settle (nothing pre-picked), then every pick explained. Settings
 * always follow from facts through the server's rulebook (`settingsByFacts`),
 * so answering a question updates the picks below it.
 */
export function ReviewFlowA({
  rec,
  file,
  isCreating,
  error,
  onBack,
  onCustomize,
  onCreate,
}: {
  rec: SetupRecommendation
  file: File
  isCreating: boolean
  error: string | null
  onBack: () => void
  onCustomize: (settings: SetupRecommendation["settings"], range: SetupRecommendation["pageRange"]) => void
  onCreate: (settings: SetupRecommendation["settings"], range: SetupRecommendation["pageRange"]) => void
}) {
  const { t, i18n } = useLingui()
  const form = useWizardForm()
  const label = useStore(form.store, (s) => s.values.label)
  const values = useStore(form.store, (s) => s.values)
  const { data: books } = useBooks()
  const existingLabels = books?.map((b: { label: string }) => b.label) ?? []

  const asked = rec.facts.filter((f) => f.ask)
  const [answers, setAnswers] = useState<Partial<Record<SetupBookFactId, string>>>({})
  const range = rec.pageRange && rec.pageRange.skipped.length > 0 ? rec.pageRange : null
  const [useRange, setUseRange] = useState(range !== null)

  const factValues = useMemo(() => {
    const out = {} as Record<SetupBookFactId, string>
    for (const f of rec.facts) out[f.id] = (f.ask ? answers[f.id] : undefined) ?? f.value
    return out
  }, [rec.facts, answers])
  const settings = rec.settingsByFacts[setupFactsKey(factValues)] ?? rec.settings
  const allAnswered = asked.every((f) => answers[f.id] !== undefined)
  const nameOk = isStep1BasicInfoValid({ ...values, label }, existingLabels)
  const canCreate = allAnswered && nameOk && !isCreating

  const evidencePages = useMemo(
    () => [...new Set([rec.previewPage, ...rec.facts.flatMap((f) => f.evidencePages), ...Object.values(rec.settingEvidence).flat()])],
    [rec],
  )
  const images = usePdfPageImages(file, evidencePages, 160)
  const preview = usePdfPageImages(file, [rec.previewPage], 520)

  // Never state an open question as a fact: an unanswered fact stays out of the headline.
  const settled = (id: SetupBookFactId) => !asked.some((f) => f.id === id) || answers[id] !== undefined
  const headline =
    settled("genre") && settled("composition")
      ? [i18n._(FACT_SHORT.genre[factValues.genre]), i18n._(FACT_SHORT.composition[factValues.composition])].join(" · ")
      : settled("genre")
        ? i18n._(FACT_SHORT.genre[factValues.genre])
        : t`We need your help with this one`
  const chosenRange = useRange ? range : null

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-muted">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row">
          <div className="flex h-[220px] w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted sm:w-[170px]">
            {preview[rec.previewPage] ? (
              <img src={preview[rec.previewPage]} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Trans>Your book, as we read it</Trans>
            </p>
            <h1 className="text-2xl font-semibold leading-tight text-foreground">{headline}</h1>
            <p className="text-sm text-muted-foreground">
              {rec.pageCount <= 30 ? (
                <Trans>We looked at all {rec.pageCount} pages.</Trans>
              ) : (
                <Trans>We looked at about 40 of the {rec.pageCount} pages: the opening, the middle and the end.</Trans>
              )}{" "}
              {i18n._(TEXT_LAYER[rec.measured.textLayer])}
            </p>
            <p className="text-sm text-foreground">
              {asked.length === 0 ? (
                <Trans>We're fairly sure about everything below. Open any line to see why.</Trans>
              ) : asked.length === 1 ? (
                <Trans>One thing needs your answer before we can create the book.</Trans>
              ) : (
                <Trans>{asked.length} things need your answer before we can create the book.</Trans>
              )}
            </p>
          </div>
        </header>

        {asked.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              <Trans>Please check</Trans>
            </h2>
            {asked.map((f) => (
              <AskCard
                key={f.id}
                fact={f}
                answer={answers[f.id]}
                onAnswer={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))}
                images={images}
              />
            ))}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            <Trans>What we picked</Trans>
          </h2>
          {!allAnswered && (
            <p className="text-sm text-muted-foreground">
              <Trans>Some picks below may change when you answer the questions above.</Trans>
            </p>
          )}
          {SETTING_ORDER.map((id) => {
            const pick = settings[id]!
            const words = SETTING_VALUE[id][String(pick.value)]
            const original = rec.settings[id]!
            return (
              <PickRow
                key={id}
                name={i18n._(SETTING_NAME[id])}
                value={words ? i18n._(words.name) : String(pick.value)}
                means={words ? i18n._(words.means) : ""}
                why={RULE_WHY[pick.rule] ? i18n._(RULE_WHY[pick.rule]) : pick.rule}
                pages={rec.settingEvidence[id] ?? []}
                images={images}
                locked={rec.lockedSettings.includes(id)}
                changed={allAnswered && asked.length > 0 && original.value !== pick.value}
              />
            )
          })}
          {range && (
            <PickRow
              name={i18n._(SETTING_NAME.pageRange)}
              value={
                useRange
                  ? t`Pages ${range.start}–${range.end} of ${rec.pageCount}`
                  : t`All ${rec.pageCount} pages`
              }
              means={t`Only these pages are turned into the digital book. The rest of the PDF is left out.`}
              why={[
                ...range.skipped.map((s) =>
                  s.why === "opening"
                    ? s.from === s.to
                      ? t`Page ${s.from} comes before the book starts.`
                      : t`Pages ${s.from}–${s.to} come before the book starts.`
                    : s.from === s.to
                      ? t`Page ${s.from} is an end page.`
                      : t`Pages ${s.from}–${s.to} are end pages.`,
                ),
                // Only one block of pages can be imported, so a kept cover can't be joined to it.
                ...(range.keepCover && range.start > 1 ? [t`The cover (page 1) is left out too.`] : []),
              ].join(" ")}
              pages={range.skipped.map((s) => s.from)}
              images={images}
              locked
              extra={
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input id="auto-use-range" type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} />
                  <Trans>Leave out these pages</Trans>
                </label>
              }
            />
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
          <form.Field name="label" validators={{ onChange: createProjectLabelSchema(existingLabels) }}>
            {(field) => (
              <ProjectNameField
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </section>

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            <Trans>Back</Trans>
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onCustomize(settings, chosenRange)}>
              <SlidersHorizontal className="mr-1.5 h-4 w-4" />
              <Trans>Change settings myself</Trans>
            </Button>
            <Button type="button" disabled={!canCreate} onClick={() => onCreate(settings, chosenRange)}>
              {isCreating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />}
              {isCreating ? <Trans>Creating...</Trans> : <Trans>Create book</Trans>}
            </Button>
          </div>
        </div>
        {!allAnswered && (
          <p className="text-center text-xs text-muted-foreground">
            <Trans>Answer the questions above to create the book.</Trans>
          </p>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          <Trans>
            For testers: engine E3 with {rec.model}. Scan {Math.round(rec.timings.profileMs)} ms, AI reading{" "}
            {Math.round(Math.max(rec.timings.labelsMs ?? 0, rec.timings.questionsMs ?? 0))} ms, total{" "}
            {Math.round(rec.timings.totalMs)} ms, {Math.round(rec.timings.uploadBytes / 1024)} KB sent.
          </Trans>
        </p>
      </div>
    </div>
  )
}
