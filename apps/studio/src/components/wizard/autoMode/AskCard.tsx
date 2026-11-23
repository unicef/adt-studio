import { useLingui } from "@lingui/react"
import { Trans } from "@lingui/react/macro"
import { Lock } from "lucide-react"
import type { SetupFact } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_LONG, FACT_QUESTION, FACT_SHORT, OTHER_POSSIBILITY, OUR_GUESS } from "./words"
import { PagesStrip } from "./PagesStrip"

const OPTIONS: Record<SetupFact["id"], string[]> = {
  genre: ["story", "textbook", "reference"],
  exercises: ["none", "some", "many"],
  composition: ["text-in-art", "text-beside-art", "text-mostly"],
  diagrams: ["none", "some", "many"],
}

/**
 * One question the AI couldn't settle. Nothing is pre-picked: when the two
 * readings disagree, their answers are tagged "Our guess" and "Other
 * possibility"; when only the opening pages were read, nothing is tagged.
 */
export function AskCard({
  fact,
  answer,
  onAnswer,
  images,
}: {
  fact: SetupFact
  answer: string | undefined
  onAnswer: (value: string) => void
  images: Record<number, string>
}) {
  const { i18n } = useLingui()
  const disagree = fact.askReason === "readings-disagree"
  const name = `auto-ask-${fact.id}`
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-700 dark:bg-amber-950/30">
      <legend className="sr-only">{i18n._(FACT_QUESTION[fact.id])}</legend>
      <p className="text-[15px] font-semibold text-foreground">{i18n._(FACT_QUESTION[fact.id])}</p>
      {disagree ? (
        <p className="text-sm text-muted-foreground">
          <Trans>We read your book in two ways and got two different answers.</Trans>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Trans>The pages we read all come before the book starts (cover, title page, foreword), so we can't tell yet.</Trans>
        </p>
      )}
      {fact.affectsLocked && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          <Trans>Your answer decides something that can't be changed after the book is created.</Trans>
        </p>
      )}
      <div className="flex flex-col gap-2">
        {OPTIONS[fact.id].map((value) => {
          const tag = !disagree
            ? null
            : value === fact.value
              ? i18n._(OUR_GUESS)
              : value === fact.secondOpinion
                ? i18n._(OTHER_POSSIBILITY)
                : null
          const checked = answer === value
          return (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border bg-background p-3 text-sm transition-colors",
                checked ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30",
              )}
            >
              <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={() => onAnswer(value)}
                className="mt-1"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  {i18n._(FACT_SHORT[fact.id][value])}
                  {tag && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {tag}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">{i18n._(FACT_LONG[fact.id][value])}</span>
              </span>
            </label>
          )
        })}
      </div>
      {fact.evidencePages.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">
            <Trans>Pages we looked at:</Trans>
          </p>
          <PagesStrip pages={fact.evidencePages} images={images} />
        </div>
      )}
    </fieldset>
  )
}
