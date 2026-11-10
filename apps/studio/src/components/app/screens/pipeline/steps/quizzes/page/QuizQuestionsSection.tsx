import { HelpCircle } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { PageSection } from "../../shared/page-inspector/PageSection"
import type { SectionMore } from "../../shared/page-inspector/useInspectorSheet"
import { SaveError } from "../../shared/ui"
import type { QuizRowContext } from "../QuizRowItem"
import { QuizCompactItem } from "./QuizCompactItem"
import type { PageQuiz } from "./pageQuizzes"

export function QuestionsTitle({ count }: { count: number }) {
  return <Trans>Questions · {count}</Trans>
}

export function QuizQuestionsSection({
  items,
  ctx,
  saveError,
  moreFor,
}: {
  items: PageQuiz[]
  ctx: QuizRowContext
  saveError: Error | null
  moreFor: (key: string) => SectionMore
}) {
  if (items.length === 0)
    return <PageSection icon={HelpCircle} title={<Trans>Questions</Trans>} empty={<Trans>No questions were made from this page.</Trans>} />
  const made = items.filter((item) => item.madeFrom).length
  return (
    <PageSection icon={HelpCircle} title={<QuestionsTitle count={items.length} />}>
      <p className="-mt-1 text-[12px] leading-relaxed text-muted-foreground">
        {made === items.length ? (
          <Trans>Written from this page and the pages around it.</Trans>
        ) : made === 0 ? (
          <Trans>Shown to readers after this page.</Trans>
        ) : (
          <Trans>Written from this page, or shown to readers after it.</Trans>
        )}
      </p>
      <SaveError error={saveError} />
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <QuizCompactItem key={item.quiz.quizId} item={item} ctx={ctx} more={moreFor(item.quiz.quizId)} />
        ))}
      </div>
    </PageSection>
  )
}
