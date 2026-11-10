import { ArrowUpRight, Check } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { SectionMore } from "../../shared/page-inspector/useInspectorSheet"
import { SEE_MORE } from "../../shared/page-inspector/SeeMoreButton"
import { MUTED_CONTAINER, MUTED_PRIMARY, QUIET_CHIP } from "../../shared/ui"
import type { QuizRowContext } from "../QuizRowItem"
import { optionLetter } from "../quizRows"
import { RemoveQuizButton, UndoRemoveButton } from "../RemoveQuizButton"
import type { PageQuiz } from "./pageQuizzes"

const CHIP = "inline-flex h-5 items-center rounded-full border px-1.5 font-mono text-[10.5px] whitespace-nowrap tabular-nums"

export function QuizCompactItem({ item, ctx, more }: { item: PageQuiz; ctx: QuizRowContext; more: SectionMore }) {
  const { t } = useLingui()
  const { quiz, position, removed, madeFrom, shownAfter } = item
  const range = ctx.rangeOf(quiz)
  const afterNumber = ctx.pageNumbers.get(quiz.afterPageId)
  const letter = optionLetter(quiz.answerIndex)
  const answer = quiz.options[quiz.answerIndex]?.text ?? ""
  const edited = !removed && ctx.isEdited(quiz)
  return (
    <div
      role="group"
      data-row-key={quiz.quizId}
      aria-label={t`Question ${position}`}
      aria-description={removed ? t`Removed: leaves the book when you save` : edited ? t`edited` : undefined}
      className={cn(
        "group/row flex flex-col gap-2 rounded-xl border p-3 transition-[background-color,border-color] duration-200 motion-reduce:transition-none",
        removed ? MUTED_CONTAINER : "bg-card",
        more.open && "border-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
      )}
    >
      <div className="flex min-h-7 items-center gap-1.5">
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full transition-[opacity,transform] duration-200 motion-reduce:transition-none", edited ? "scale-100 opacity-100" : "scale-50 opacity-0")}
          style={{ background: ctx.hex }}
        />
        <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">{t`Q${position}`}</span>
        {madeFrom && range && (
          <span title={t`Made from pages ${range}`} className={cn(CHIP, "text-muted-foreground")}>
            {t`from p. ${range}`}
          </span>
        )}
        {shownAfter ? (
          <span
            className={cn(CHIP, "font-sans font-semibold")}
            style={{ borderColor: `color-mix(in srgb, ${ctx.hex} 35%, transparent)`, background: `color-mix(in srgb, ${ctx.hex} 10%, transparent)` }}
          >
            <Trans>Shown after this page</Trans>
          </span>
        ) : (
          afterNumber != null && (
            <button
              type="button"
              onClick={() => ctx.onOpenPage(quiz.afterPageId)}
              title={t`Shown after page ${afterNumber}. Open page ${afterNumber}`}
              aria-label={t`Shown after page ${afterNumber}. Open page ${afterNumber}`}
              className={cn(CHIP, "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
            >
              {t`after p.${afterNumber}`}
            </button>
          )
        )}
        <span className="ml-auto flex items-center gap-1">
          {removed ? (
            <>
              <span className={QUIET_CHIP}>{t`Removed`}</span>
              <UndoRemoveButton position={position} disabled={ctx.locked} onUndo={() => ctx.onUndo(quiz.quizId)} />
            </>
          ) : (
            <RemoveQuizButton position={position} disabled={ctx.locked} onRemove={() => ctx.onRemove(quiz.quizId)} />
          )}
        </span>
      </div>
      <p className={cn("line-clamp-3 text-[13px] leading-snug font-medium", removed ? MUTED_PRIMARY : "text-foreground")}>{quiz.question}</p>
      {!removed && (
        <>
          <p className="flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
            <span className="inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-full border px-1.5 text-[10.5px] font-semibold text-foreground">
              {letter}
              <Check aria-hidden className="size-3 text-emerald-600 dark:text-emerald-400" />
            </span>
            <span className="line-clamp-2">
              <span className="sr-only">{t`Correct answer:`} </span>
              {answer}
            </span>
          </p>
          <button ref={more.buttonRef} type="button" onClick={more.onMore} aria-haspopup="dialog" aria-expanded={more.open} className={SEE_MORE}>
            <Trans>Edit question</Trans>
            <ArrowUpRight className="size-3" />
          </button>
        </>
      )}
    </div>
  )
}
