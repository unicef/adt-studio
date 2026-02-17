import { useState, useEffect, useRef, useCallback } from "react"
import { Check, CheckCircle2, XCircle, ChevronDown, Loader2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { QuizGenerationOutput, VersionEntry } from "@/api/client"
import { useQuizzes } from "@/hooks/use-quizzes"
import { useStepHeader } from "../StepViewRouter"
import { useStepRun } from "@/hooks/use-step-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StepRunCard } from "../StepRunCard"
import { STEP_DESCRIPTIONS } from "../StepSidebar"

const QUIZZES_SUB_STEPS = [
  { key: "quiz-generation", label: "Generate Quizzes" },
]

type QuizData = QuizGenerationOutput

function VersionPicker({
  currentVersion,
  saving,
  dirty,
  bookLabel,
  onPreview,
  onSave,
  onDiscard,
}: {
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
  onPreview: (data: unknown) => void
  onSave: () => void
  onDiscard: () => void
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleOpen = async () => {
    if (saving || currentVersion == null) return
    setOpen(true)
    setLoading(true)
    const res = await api.getVersionHistory(bookLabel, "quiz-generation", "book", true)
    setVersions(res.versions)
    setLoading(false)
  }

  const handlePick = (v: VersionEntry) => {
    if (v.version === currentVersion && !dirty) {
      setOpen(false)
      return
    }
    setOpen(false)
    onPreview(v.data)
  }

  if (saving) {
    return <Loader2 className="h-3 w-3 animate-spin" />
  }

  if (currentVersion == null) return null

  if (dirty) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDiscard}
          className="text-[10px] font-medium rounded px-2 py-0.5 bg-black/15 text-black hover:bg-black/25 cursor-pointer transition-colors"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 bg-white text-orange-800 hover:bg-white/80 cursor-pointer transition-colors"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal bg-white/20 text-white hover:bg-white/30 rounded px-1.5 py-0.5 transition-colors"
      >
        v{currentVersion}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-popover border rounded shadow-md min-w-[80px] py-1">
          {loading ? (
            <div className="flex items-center justify-center py-2 px-3">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            versions.map((v) => (
              <button
                key={v.version}
                type="button"
                onClick={() => handlePick(v)}
                className={`w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors ${
                  v.version === currentVersion ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                v{v.version}
              </button>
            ))
          ) : (
            <div className="px-3 py-1 text-xs text-muted-foreground">No versions</div>
          )}
        </div>
      )}
    </div>
  )
}

export function QuizzesView({ bookLabel }: { bookLabel: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuizzes(bookLabel)
  const { setExtra } = useStepHeader()
  const { progress: stepProgress, startRun, setSseEnabled } = useStepRun()
  const { apiKey, hasApiKey } = useApiKey()
  const quizzesState = stepProgress.steps.get("quizzes")?.state
  const quizzesRunning = quizzesState === "running" || quizzesState === "queued"

  const handleRunQuizzes = useCallback(async () => {
    if (!hasApiKey || quizzesRunning) return
    startRun("quizzes", "quizzes")
    setSseEnabled(true)
    await api.runSteps(bookLabel, apiKey, { fromStep: "quizzes", toStep: "quizzes" })
    queryClient.removeQueries({ queryKey: ["books", bookLabel, "quizzes"] })
  }, [bookLabel, apiKey, hasApiKey, quizzesRunning, startRun, setSseEnabled, queryClient])

  const [pending, setPending] = useState<QuizData | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset pending when data changes
  useEffect(() => {
    setPending(null)
  }, [data?.version])

  const effective = pending ?? data?.quizzes
  const quizzes = effective?.quizzes ?? []
  const dirty = pending != null

  const saveQuizzes = useCallback(async () => {
    if (!pending) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateQuizzes(bookLabel, pending)
    setPending(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "quizzes"] })
    await minDelay
    setSaving(false)
  }, [pending, bookLabel, queryClient])

  const saveRef = useRef(saveQuizzes)
  saveRef.current = saveQuizzes

  useEffect(() => {
    if (!data?.quizzes) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{quizzes.length} questions</span>
        <VersionPicker
          currentVersion={data.version}
          saving={saving}
          dirty={dirty}
          bookLabel={bookLabel}
          onPreview={(d) => setPending(d as QuizData)}
          onSave={() => saveRef.current()}
          onDiscard={() => setPending(null)}
        />
      </div>
    )
    return () => setExtra(null)
  }, [data, quizzes.length, saving, dirty, bookLabel])

  const updateQuestion = (idx: number, question: string) => {
    const base = pending ?? data?.quizzes
    if (!base) return
    setPending({
      ...base,
      quizzes: base.quizzes.map((q, i) =>
        i === idx ? { ...q, question } : q
      ),
    })
  }

  const updateOptionText = (quizIdx: number, optIdx: number, text: string) => {
    const base = pending ?? data?.quizzes
    if (!base) return
    setPending({
      ...base,
      quizzes: base.quizzes.map((q, i) =>
        i === quizIdx
          ? { ...q, options: q.options.map((o, j) => (j === optIdx ? { ...o, text } : o)) }
          : q
      ),
    })
  }

  const updateOptionExplanation = (quizIdx: number, optIdx: number, explanation: string) => {
    const base = pending ?? data?.quizzes
    if (!base) return
    setPending({
      ...base,
      quizzes: base.quizzes.map((q, i) =>
        i === quizIdx
          ? { ...q, options: q.options.map((o, j) => (j === optIdx ? { ...o, explanation } : o)) }
          : q
      ),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading quizzes...</span>
      </div>
    )
  }

  if (quizzes.length === 0 || quizzesRunning) {
    return (
      <div className="p-4">
        <StepRunCard
          stepSlug="quizzes"
          subSteps={QUIZZES_SUB_STEPS}
          description={STEP_DESCRIPTIONS.quizzes}
          isRunning={quizzesRunning}
          onRun={handleRunQuizzes}
          disabled={!hasApiKey || quizzesRunning}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {quizzes.map((quiz, idx) => (
        <div key={idx} className="rounded-md border bg-card overflow-hidden">
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <textarea
              value={quiz.question}
              onChange={(e) => updateQuestion(idx, e.target.value)}
              className="flex-1 text-sm font-medium resize-none rounded border border-transparent bg-transparent p-1 -m-1 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              rows={1}
            />
            <span className="text-[10px] text-muted-foreground shrink-0 mt-1.5">
              After {quiz.afterPageId}
            </span>
          </div>
          <div className="px-4 pb-3 space-y-1.5">
            {quiz.options.map((option, i) => (
              <div
                key={i}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-md ${
                  i === quiz.answerIndex
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-muted/50 text-muted-foreground"
                }`}
              >
                {i === quiz.answerIndex ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-1.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 opacity-30 mt-1.5" />
                )}
                <div className="flex-1 min-w-0">
                  <textarea
                    value={option.text}
                    onChange={(e) => updateOptionText(idx, i, e.target.value)}
                    className="w-full text-sm resize-none rounded border border-transparent bg-transparent p-1 -m-1 hover:border-border hover:bg-white/50 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                    rows={1}
                  />
                  <textarea
                    value={option.explanation}
                    onChange={(e) => updateOptionExplanation(idx, i, e.target.value)}
                    className="w-full text-xs opacity-70 resize-none rounded border border-transparent bg-transparent p-1 -m-1 mt-0.5 hover:border-border hover:bg-white/50 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring focus:opacity-100 transition-colors"
                    rows={1}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
