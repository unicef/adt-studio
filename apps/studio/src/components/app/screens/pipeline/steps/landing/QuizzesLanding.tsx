import { useState, useEffect, useMemo, useRef , type ReactNode } from "react"
import { Plus } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SegmentedControl,
  type SegmentedControlOption,
} from "@/components/ui/segmented-control"
import { StepLandingShell } from "./StepLandingShell"
import { useLandingRunGate } from "./useLandingRunGate"
import { RunErrorNotice } from "../shared/RunErrorNotice"
import { HistoryRestoreNotice } from "../shared/HistoryRestoreNotice"
import { quizzesVersionDiff } from "../shared/versionDiffs"
import { useQuizzes } from "@/hooks/use-quizzes"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import {
  SettingsCard,
  SettingsField,
} from "./ui/SettingsCard"
import { useActiveConfig } from "@/hooks/use-debug"
import { useBookConfig } from "@/hooks/use-book-config"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { QuizzesPreview } from "@/components/pipeline/stages/quizzes/components/QuizzesPreview"
import { AddQuizDialog } from "@/components/pipeline/stages/quizzes/AddQuizDialog"

const DEFAULT_PAGES_PER_QUIZ = 3

type QuizMode = "frequency" | "specific"

export function QuizzesLanding({ bookLabel, beforeRun }: { bookLabel: string; beforeRun?: ReactNode }) {
  const { t } = useLingui()
  const quizzesQuery = useQuizzes(bookLabel)
  const historyDiff = useMemo(() => quizzesVersionDiff(t), [t])
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("quizzes")
  const storyboardStatus = useStageStatus("storyboard")
  const storyboardReady = storyboardStatus.isCompleted
  const gate = useLandingRunGate(bookLabel, "quizzes", [
    {
      ok: storyboardReady,
      reason: (
        <Trans>
          Run Storyboard first — quizzes are written from the content placed into
          pages by Storyboard.
        </Trans>
      ),
    },
  ])

  const [mode, setMode] = useState<QuizMode>("frequency")
  const [showAddQuiz, setShowAddQuiz] = useState(false)
  const [pagesPerQuiz, setPagesPerQuiz] = useState(String(DEFAULT_PAGES_PER_QUIZ))
  const lastValidPagesPerQuiz = useRef(String(DEFAULT_PAGES_PER_QUIZ))

  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    const qg = m.quiz_generation as Record<string, unknown> | undefined
    if (qg?.pages_per_quiz != null) {
      const value = String(qg.pages_per_quiz)
      setPagesPerQuiz(value)
      lastValidPagesPerQuiz.current = value
    }
  }, [activeConfigData])

  const handleFrequencyChange = (value: string) => {
    const sanitized = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
    setPagesPerQuiz(sanitized)
    const n = Number(sanitized)
    if (!Number.isInteger(n) || n < 1) return
    lastValidPagesPerQuiz.current = sanitized
    const existing =
      (bookConfigData?.config?.quiz_generation as Record<string, unknown>) ?? {}
    persist({ quiz_generation: { ...existing, pages_per_quiz: n } })
  }

  const handleFrequencyBlur = () => {
    const n = Number(pagesPerQuiz)
    if (Number.isInteger(n) && n >= 1) return
    setPagesPerQuiz(lastValidPagesPerQuiz.current)
  }

  const handleRun = () => {
    if (gate.blocked || status.isRunning) return
    queueRun({ fromStage: "quizzes", toStage: "quizzes", apiKey })
  }

  const disabledReason = gate.disabledReason ?? (status.isRunning ? (
    <Trans>Quizzes are generating. Wait for the run to finish before adding a quiz.</Trans>
  ) : undefined)

  const modeOptions: SegmentedControlOption<QuizMode>[] = [
    { value: "frequency", label: t`Every few pages` },
    { value: "specific", label: t`Specific pages` },
  ]

  return (
    <StepLandingShell
      title={<Trans>Quizzes</Trans>}
      description={<Trans> Generate multiple-choice comprehension quizzes from the book's content. Create them automatically across the whole book, or add a single quiz from specific pages. </Trans>}
      notice={
        status.hasError ? (
          <RunErrorNotice label={bookLabel} stage="quizzes" />
        ) : (
          <HistoryRestoreNotice
            label={bookLabel}
            step="quiz-generation"
            message={<Trans>There's an earlier version of these questions. Restore it instead of running again.</Trans>}
            version={quizzesQuery.data?.version ?? null}
            historyVersion={quizzesQuery.data?.historyVersion ?? null}
            diff={historyDiff}
          />
        )
      }
      beforeRun={beforeRun}
      bookLabel={bookLabel}
      stageSlug="quizzes"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={gate.blocked}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Quizzes</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Quiz Preview`}
      onRun={handleRun}
      hideRunButton={mode === "specific"}
      preview={<QuizzesPreview pagesPerQuiz={Number(pagesPerQuiz)} mode={mode} />}
    >

      <PrereqGuard
        upstreamSlug="storyboard"
        stageSlug="quizzes"
        description={
          <Trans>
            Quizzes are written from the content that Storyboard places into
            pages. Finish Storyboard before running this stage.
          </Trans>
        }
      />

      <SettingsCard>
        <SettingsField
          label={<Trans>How to add quizzes</Trans>}
          hint={
            mode === "frequency" ? (
              <Trans>
                Automatically create quizzes across the whole book at a set
                frequency.
              </Trans>
            ) : (
              <Trans>
                Create one quiz from specific pages and place it exactly where
                you want it in the book.
              </Trans>
            )
          }
        >
          <SegmentedControl
            options={modeOptions}
            value={mode}
            onValueChange={setMode}
          />
        </SettingsField>

        {mode === "frequency" ? (
          <SettingsField
            label={<Trans>Quiz frequency</Trans>}
            hint={
              <Trans>
                How many pages of content go into each quiz. A lower number
                means more quizzes across the book.
              </Trans>
            }
          >
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pagesPerQuiz}
                onChange={(e) => handleFrequencyChange(e.target.value)}
                onBlur={handleFrequencyBlur}
                className="w-24 h-9"
              />
              <span className="text-[13px] text-muted-foreground">
                <Trans>pages per quiz</Trans>
              </span>
            </div>
          </SettingsField>
        ) : (
          <SettingsField
            label={<Trans>Add a quiz</Trans>}
            hint={
              <Trans>
                Choose the source pages and where the quiz lands in the page
                editor.
              </Trans>
            }
          >
            <Button
              onClick={() => setShowAddQuiz(true)}
              disabled={gate.blocked || status.isRunning}
              className="h-10 gap-1.5 border-0 bg-orange-600 px-4 text-white hover:bg-orange-700"
            >
              <Plus className="h-4 w-4" />
              <Trans>Add a quiz</Trans>
            </Button>
            {disabledReason && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {disabledReason}
              </p>
            )}
          </SettingsField>
        )}
      </SettingsCard>

      <AddQuizDialog
        open={showAddQuiz}
        onOpenChange={setShowAddQuiz}
        bookLabel={bookLabel}
        onCreated={() => setShowAddQuiz(false)}
      />
    </StepLandingShell>
  )
}
