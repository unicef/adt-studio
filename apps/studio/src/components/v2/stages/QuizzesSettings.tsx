import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/v2/PromptViewer"
import { useStepRun } from "@/hooks/use-step-run"

export function QuizzesSettings({ bookLabel, headerTarget, tab = "general" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { apiKey, hasApiKey } = useApiKey()
  const { startRun, setSseEnabled } = useStepRun()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showRerunDialog, setShowRerunDialog] = useState(false)

  const [model, setModel] = useState("")
  const [pagesPerQuiz, setPagesPerQuiz] = useState("")
  const [promptDraft, setPromptDraft] = useState<string | null>(null)
  const [sectionTypes, setSectionTypes] = useState<Record<string, string>>({})
  const [quizSectionTypes, setQuizSectionTypes] = useState<Set<string>>(new Set())

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  useEffect(() => {
    if (!activeConfigData) return
    setSectionTypes({})
    setQuizSectionTypes(new Set())
    const merged = activeConfigData.merged as Record<string, unknown>
    if (merged.quiz_generation && typeof merged.quiz_generation === "object") {
      const qg = merged.quiz_generation as Record<string, unknown>
      if (qg.model) setModel(String(qg.model))
      if (qg.pages_per_quiz != null) setPagesPerQuiz(String(qg.pages_per_quiz))
      if (Array.isArray(qg.quiz_section_types)) {
        setQuizSectionTypes(new Set(qg.quiz_section_types as string[]))
      }
    }
    if (merged.section_types && typeof merged.section_types === "object") {
      setSectionTypes(merged.section_types as Record<string, string>)
    }
  }, [activeConfigData])

  const toggleQuizSectionType = (key: string) => {
    markDirty("quiz_generation")
    markDirty("quiz_section_types")
    setQuizSectionTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    if (bookConfigData?.config) Object.assign(overrides, bookConfigData.config)

    if (shouldWrite("quiz_generation")) {
      const existing = (bookConfigData?.config?.quiz_generation ?? {}) as Record<string, unknown>
      const nextQuizGeneration: Record<string, unknown> = {
        ...existing,
        model: model.trim() || undefined,
        pages_per_quiz: pagesPerQuiz ? Number(pagesPerQuiz) : undefined,
      }
      if (dirty.quiz_section_types || "quiz_section_types" in existing) {
        nextQuizGeneration.quiz_section_types = Array.from(quizSectionTypes)
      }
      overrides.quiz_generation = nextQuizGeneration
    }
    return overrides
  }

  const confirmSaveAndRerun = async () => {
    const promptSaves: Promise<unknown>[] = []
    if (promptDraft != null) promptSaves.push(api.updatePrompt("quiz_generation", promptDraft, bookLabel))
    if (promptSaves.length > 0) await Promise.all(promptSaves)

    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: async () => {
          setDirty({})
          setPromptDraft(null)
          setShowRerunDialog(false)
          startRun("quizzes", "quizzes")
          setSseEnabled(true)
          await api.runSteps(bookLabel, apiKey, { fromStep: "quizzes", toStep: "quizzes" })
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "quizzes"] })
          queryClient.removeQueries({ queryKey: ["books", bookLabel] })
          navigate({ to: "/books/$label/v2/$step", params: { label: bookLabel, step: "quizzes" } })
        },
      }
    )
  }

  const sectionTypeKeys = Object.keys(sectionTypes).filter((k) => !k.startsWith("activity_"))

  return (
    <div className={tab === "prompt" ? "h-full max-w-4xl" : "p-4 max-w-2xl space-y-6"}>
      {tab === "general" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Pages per Quiz</Label>
            <Input
              type="number"
              min={1}
              value={pagesPerQuiz}
              onChange={(e) => { setPagesPerQuiz(e.target.value); markDirty("quiz_generation") }}
              placeholder="3"
              className="w-32 h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Number of pages of content to include per quiz question.
            </p>
          </div>

          {sectionTypeKeys.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Quiz Section Types</Label>
              <p className="text-xs text-muted-foreground">
                Only pages containing these section types are counted when grouping pages for quiz generation.
              </p>
              <div className="rounded-md border divide-y">
                {sectionTypeKeys.map((key) => {
                  const checked = quizSectionTypes.has(key)
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleQuizSectionType(key)}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      <span className="text-xs font-mono">{key}</span>
                      <span className="text-xs text-muted-foreground truncate">{sectionTypes[key]}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "prompt" && (
        <PromptViewer
          promptName="quiz_generation"
          bookLabel={bookLabel}
          title="Quiz Generation Prompt"
          description="The prompt template used to generate quiz questions from page content."
          model={model}
          onModelChange={(v) => { setModel(v); markDirty("quiz_generation") }}
          onContentChange={setPromptDraft}
          enabled={tab === "prompt"}
        />
      )}

      {headerTarget && createPortal(
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs bg-black/15 text-white hover:bg-black/25"
          onClick={() => setShowRerunDialog(true)}
          disabled={updateConfig.isPending || !hasApiKey}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Save &amp; Rerun
        </Button>,
        headerTarget
      )}

      <Dialog open={showRerunDialog} onOpenChange={setShowRerunDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save &amp; Rerun Quizzes</DialogTitle>
            <DialogDescription>
              This will save your settings and re-run quiz generation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRerunDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSaveAndRerun} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? "Saving..." : "Confirm Rerun"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
