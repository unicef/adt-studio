import { useQuizzes } from "@/hooks/use-quizzes"
import { QuizzesLandingPage } from "./QuizzesLandingPage"
import { QuizzesView } from "./QuizzesView"
import { useLingui } from "@lingui/react/macro"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ActivitiesWorkspace } from "./activities/ActivitiesWorkspace"
import { useHasUnsavedChanges } from "../../components/floating-save"

export function QuizzesIndex({
  bookLabel,
  selectedPageId,
}: {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const { data } = useQuizzes(bookLabel)
  const { t } = useLingui()
  const hasUnsavedChanges = useHasUnsavedChanges()
  const hasQuizzes = (data?.quizzes?.quizzes?.length ?? 0) > 0

  return (
    <Tabs defaultValue="activities" className="flex h-full min-h-0 flex-col">
      <TabsList className="mx-4 mt-3 self-start" aria-label={t`Activities and quizzes`}>
        <TabsTrigger value="activities" disabled={hasUnsavedChanges}>{t`Activities`}</TabsTrigger>
        <TabsTrigger value="quizzes">{t`Quizzes`}</TabsTrigger>
      </TabsList>
      {hasUnsavedChanges && <p role="status" className="mx-4 mt-2 text-sm text-muted-foreground">{t`Save or discard your edits first`}</p>}
      <TabsContent value="activities" className="min-h-0 flex-1 overflow-auto">
        <ActivitiesWorkspace key={bookLabel} bookLabel={bookLabel} selectedPageId={selectedPageId} />
      </TabsContent>
      <TabsContent value="quizzes" className="min-h-0 flex-1 overflow-auto">
        {hasQuizzes
          ? <QuizzesView bookLabel={bookLabel} selectedPageId={selectedPageId} />
          : <QuizzesLandingPage bookLabel={bookLabel} />}
      </TabsContent>
    </Tabs>
  )
}
