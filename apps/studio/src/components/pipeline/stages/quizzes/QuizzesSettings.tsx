import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { AddQuizDialog } from "./AddQuizDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { useStageStatus } from "@/hooks/use-stage-status"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/components/PromptViewer"
import { useStageSettingsBar } from "@/hooks/use-stage-settings-bar"
import { useDirtyTabTracker } from "@/hooks/use-settings-dirty-tabs"
import { useStepConfig } from "@/hooks/use-step-config"
import { useLingui } from "@lingui/react/macro"
import { getSectionTypeLabel, getSectionTypeDescription } from "@/lib/section-constants"

function getSectionTypeDisplayLabel(value: string): string {
  return getSectionTypeLabel(value) || value.replace(/_/g, " ")
}

function getSectionTypeDisplayDescription(value: string, configDesc: string): string {
  return getSectionTypeDescription(value) ?? configDesc
}

export function QuizzesSettings({ bookLabel, tab = "general" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { hasApiKey } = useApiKey()
  const quizzesStatus = useStageStatus("quizzes")
  const [showAddQuiz, setShowAddQuiz] = useState(false)

  const [pagesPerQuiz, setPagesPerQuiz] = useState("")
  const [promptDraft, setPromptDraft] = useState<string | null>(null)
  const [sectionTypes, setSectionTypes] = useState<Record<string, string>>({})
  const [quizSectionTypes, setQuizSectionTypes] = useState<Set<string>>(new Set())

  const { markedTabs, markTab, resetMarkedTabs } = useDirtyTabTracker()
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => {
    setDirty((prev) => ({ ...prev, [field]: true }))
    markTab(tab)
  }

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const quiz = useStepConfig(merged, "quiz_generation", markDirty)

  useEffect(() => {
    if (!activeConfigData) return
    setSectionTypes({})
    setQuizSectionTypes(new Set())
    const m = activeConfigData.merged as Record<string, unknown>
    if (m.quiz_generation && typeof m.quiz_generation === "object") {
      const qg = m.quiz_generation as Record<string, unknown>
      if (qg.pages_per_quiz != null) setPagesPerQuiz(String(qg.pages_per_quiz))
      if (Array.isArray(qg.quiz_section_types)) {
        setQuizSectionTypes(new Set(qg.quiz_section_types as string[]))
      }
    }
    if (m.section_types && typeof m.section_types === "object") {
      const all = m.section_types as Record<string, string>
      const disabled = new Set(Array.isArray(m.disabled_section_types) ? m.disabled_section_types as string[] : [])
      setSectionTypes(Object.fromEntries(Object.entries(all).filter(([k]) => !disabled.has(k))))
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
        ...quiz.configOverrides,
        pages_per_quiz: pagesPerQuiz ? Number(pagesPerQuiz) : undefined,
      }
      if (dirty.quiz_section_types || "quiz_section_types" in existing) {
        nextQuizGeneration.quiz_section_types = Array.from(quizSectionTypes)
      }
      overrides.quiz_generation = nextQuizGeneration
    }
    return overrides
  }

  const save = async () => {
    if (promptDraft != null) await api.updatePrompt("quiz_generation", promptDraft, bookLabel)
    await updateConfig.mutateAsync({ label: bookLabel, config: buildOverrides() })
    setDirty({})
    setPromptDraft(null)
    resetMarkedTabs()
  }

  const dirtyTabs = [
    ...markedTabs,
    ...(promptDraft != null ? ["prompt"] : []),
  ].filter((tabKey, i, all) => all.indexOf(tabKey) === i)

  useStageSettingsBar({
    stage: "quizzes",
    bookLabel,
    dirty: dirtyTabs.length > 0,
    dirtyTabs,
    saving: updateConfig.isPending,
    save,
  })

  const sectionTypeKeys = Object.keys(sectionTypes).filter((k) => !k.startsWith("activity_"))

  return (
    <div className={tab === "prompt" ? "h-full max-w-4xl" : "p-4 max-w-2xl space-y-6"}>
      {tab === "general" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">{t`Pages per Quiz`}</Label>
            <Input
              type="number"
              min={1}
              value={pagesPerQuiz}
              onChange={(e) => { setPagesPerQuiz(e.target.value); markDirty("quiz_generation") }}
              placeholder="3"
              className="w-32 h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t`Number of pages of content to include per quiz question.`}
            </p>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label className="text-xs">{t`Add a quiz`}</Label>
                <p className="text-xs text-muted-foreground">
                  {t`Generate a single quiz from specific pages and place it at a chosen location.`}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1.5"
                disabled={!hasApiKey || quizzesStatus.isRunning}
                onClick={() => setShowAddQuiz(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t`Add quiz`}
              </Button>
            </div>
            {!hasApiKey ? (
              <p className="text-xs text-muted-foreground">
                {t`Add an API key in Book settings to generate a quiz.`}
              </p>
            ) : quizzesStatus.isRunning ? (
              <p className="text-xs text-muted-foreground">
                {t`Quizzes are generating. Wait for the run to finish before adding a quiz.`}
              </p>
            ) : null}
          </div>

          {sectionTypeKeys.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">{t`Quiz Section Types`}</Label>
              <p className="text-xs text-muted-foreground">
                {t`Only pages containing these section types are counted when grouping pages for quiz generation.`}
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
                      <span className="text-xs font-mono">{getSectionTypeDisplayLabel(key)}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {getSectionTypeDisplayDescription(key, sectionTypes[key])}
                      </span>
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
          title={t`Quiz Generation Prompt`}
          description={t`The prompt template used to generate quiz questions from page content.`}
          model={quiz.model}
          onModelChange={quiz.onModelChange}
          maxRetries={quiz.maxRetries}
          onMaxRetriesChange={quiz.onMaxRetriesChange}
          onContentChange={setPromptDraft}
          enabled={tab === "prompt"}
        />
      )}

      <AddQuizDialog
        open={showAddQuiz}
        onOpenChange={setShowAddQuiz}
        bookLabel={bookLabel}
      />
    </div>
  )
}
