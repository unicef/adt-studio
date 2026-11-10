import { Trans } from "@lingui/react/macro"
import { FileText, HelpCircle } from "lucide-react"
import type { PageSummaryItem } from "@/api/client"
import { INSPECTOR_PANEL, INSPECTOR_PANEL_BODY } from "../../shared/page-inspector/layout"
import { SkeletonBar, SkeletonLine } from "../../shared/page-inspector/loading/SkeletonBar"
import { QuestionsTitle } from "./QuizQuestionsSection"

const PREVIEW = 3

function SectionHeader({ icon: Icon, children }: { icon: typeof FileText; children: React.ReactNode }) {
  return (
    <header className="flex min-h-7 items-center gap-2">
      <Icon className="size-3.5 text-muted-foreground" />
      <h2 className="text-[13px] font-semibold text-foreground">{children}</h2>
    </header>
  )
}

export function QuizzesPlaceholderPanel({ summary, questions }: { summary: PageSummaryItem | null; questions: readonly string[] }) {
  const preview = summary?.textPreview.trim()
  return (
    <aside className={INSPECTOR_PANEL}>
      <div className={INSPECTOR_PANEL_BODY}>
        <section className="flex flex-col gap-2.5">
          <SectionHeader icon={HelpCircle}>{questions.length > 0 ? <QuestionsTitle count={questions.length} /> : <Trans>Questions</Trans>}</SectionHeader>
          <div className="flex flex-col gap-2">
            {questions.slice(0, PREVIEW).map((question, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-xl border p-3">
                <SkeletonBar className="h-3 w-28" />
                <p className="line-clamp-3 text-[13px] leading-snug font-medium text-foreground/80">{question}</p>
                <SkeletonBar className="h-2.5 w-40" />
              </div>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHeader icon={FileText}>
            <Trans>Text</Trans>
          </SectionHeader>
          <div className="rounded-xl border bg-card px-4 py-3.5 text-[14px] leading-relaxed">
            {preview ? <p className="line-clamp-3 text-foreground/90">{preview}</p> : null}
            {Array.from({ length: preview ? 2 : 4 }, (_, index) => (
              <SkeletonLine key={index} className={index % 2 ? "w-[88%]" : "w-full"} />
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
