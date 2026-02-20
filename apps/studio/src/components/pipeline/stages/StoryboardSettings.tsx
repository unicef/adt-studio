import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Play, Plus, X, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PruneToggle } from "@/components/pipeline/PruneToggle"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { useStyleguides, useStyleguidePreview, useTemplates } from "@/hooks/use-presets"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/PromptViewer"
import { TemplateViewer } from "@/components/pipeline/TemplateViewer"
import { useStepRun } from "@/hooks/use-step-run"

/** "two_column_story" → "Two Column Story" */
function titleCase(slug: string): string {
  return slug.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

/** Human-friendly display names for strategy keys */
const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  llm: "AI Generated",
  dynamic: "Dynamic",
}

function strategyDisplayName(slug: string): string {
  return STRATEGY_DISPLAY_NAMES[slug] ?? titleCase(slug)
}

const RENDER_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  dynamic: "Automatically picks the best strategy per section type",
  llm: "LLM generates HTML from section content",
  two_column: "Fixed two-column template layout",
  two_column_story: "Two-column template for story content",
}

export function StoryboardSettings({ bookLabel, headerTarget, tab = "general" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { apiKey, hasApiKey } = useApiKey()
  const { startRun, setSseEnabled } = useStepRun()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showRerunDialog, setShowRerunDialog] = useState(false)
  const [savingImageGenPrompt, setSavingImageGenPrompt] = useState(false)

  // Form state
  const [sectionTypes, setSectionTypes] = useState<Record<string, string>>({})
  const [prunedSectionTypes, setPrunedSectionTypes] = useState<Set<string>>(new Set())
  const [sectionRenderStrategies, setSectionRenderStrategies] = useState<Record<string, string>>({})
  const [defaultRenderStrategy, setDefaultRenderStrategy] = useState("")
  const [allStrategyNames, setAllStrategyNames] = useState<string[]>([])
  const [renderStrategyNames, setRenderStrategyNames] = useState<string[]>([])
  const [activityModel, setActivityModel] = useState("")
  const [sectioningMode, setSectioningMode] = useState("section")
  const [sectioningModel, setSectioningModel] = useState("")
  const [renderingModel, setRenderingModel] = useState("")
  const [renderingPromptName, setRenderingPromptName] = useState("web_generation_html")
  const [renderingRenderType, setRenderingRenderType] = useState<string>("llm")
  const [renderingTemplateName, setRenderingTemplateName] = useState("")
  const [renderingTemperature, setRenderingTemperature] = useState("")
  const [styleguide, setStyleguide] = useState("")
  const [sectioningPromptDraft, setSectioningPromptDraft] = useState<string | null>(null)
  const [renderingPromptDraft, setRenderingPromptDraft] = useState<string | null>(null)
  const [renderingTemplateDraft, setRenderingTemplateDraft] = useState<string | null>(null)
  const [templateTabName, setTemplateTabName] = useState("")
  const [templateTabDraft, setTemplateTabDraft] = useState<string | null>(null)
  const [activityStrategyName, setActivityStrategyName] = useState("")
  const [activityPromptDraft, setActivityPromptDraft] = useState<string | null>(null)
  const [activityAnswerDraft, setActivityAnswerDraft] = useState<string | null>(null)
  const [imageGenPromptDraft, setImageGenPromptDraft] = useState<string | null>(null)

  // Derive activity strategies directly from merged config (synchronous)
  const activityStrategies = useMemo(() => {
    if (!activeConfigData) return {} as Record<string, { prompt: string; answer_prompt?: string; model?: string }>
    const merged = activeConfigData.merged as Record<string, unknown>
    const strategies = merged.render_strategies as Record<string, { render_type?: string; config?: { prompt?: string; answer_prompt?: string; model?: string } }> | undefined
    if (!strategies || typeof strategies !== "object") return {} as Record<string, { prompt: string; answer_prompt?: string; model?: string }>
    const activityMap: Record<string, { prompt: string; answer_prompt?: string; model?: string }> = {}
    for (const [name, strat] of Object.entries(strategies)) {
      if (strat.render_type === "activity" && strat.config?.prompt) {
        activityMap[name] = {
          prompt: strat.config.prompt,
          answer_prompt: strat.config.answer_prompt,
          model: strat.config.model,
        }
      }
    }
    return activityMap
  }, [activeConfigData])
  const selectedActivity = activityStrategies[activityStrategyName]

  // Derive render types from merged config (synchronous)
  const strategyRenderTypes = useMemo(() => {
    if (!activeConfigData) return {} as Record<string, string>
    const merged = activeConfigData.merged as Record<string, unknown>
    const strategies = merged.render_strategies as Record<string, { render_type?: string }> | undefined
    if (!strategies || typeof strategies !== "object") return {} as Record<string, string>
    const typeMap: Record<string, string> = {}
    for (const [name, strat] of Object.entries(strategies)) {
      typeMap[name] = strat.render_type ?? "llm"
    }
    return typeMap
  }, [activeConfigData])

  const { data: styleguidesData } = useStyleguides()
  const { data: templatesData } = useTemplates()
  const availableTemplates = templatesData?.templates ?? []
  const availableStyleguides = styleguidesData?.styleguides ?? []

  // Styleguide preview
  const [styleguidePreviewOpen, setStyleguidePreviewOpen] = useState(false)
  const [previewName, setPreviewName] = useState<string | null>(null)
  const { data: previewData, isLoading: styleguidePreviewLoading } = useStyleguidePreview(previewName)

  const openStyleguidePreview = () => {
    if (!styleguide) return
    setPreviewName(styleguide)
    setStyleguidePreviewOpen(true)
  }

  // Track which field groups the user has actually touched
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  // Load section types, pruned types, render strategy, and models from active (merged) config
  useEffect(() => {
    if (!activeConfigData) return
    const merged = activeConfigData.merged as Record<string, unknown>
    if (merged.section_types && typeof merged.section_types === "object") {
      setSectionTypes(merged.section_types as Record<string, string>)
    }
    if (Array.isArray(merged.pruned_section_types)) {
      setPrunedSectionTypes(new Set(merged.pruned_section_types as string[]))
    }
    if (merged.default_render_strategy) {
      setDefaultRenderStrategy(String(merged.default_render_strategy))
    }
    if (merged.section_render_strategies && typeof merged.section_render_strategies === "object") {
      setSectionRenderStrategies(merged.section_render_strategies as Record<string, string>)
    }
    if (merged.render_strategies && typeof merged.render_strategies === "object") {
      const strategies = merged.render_strategies as Record<string, { render_type?: string; config?: { prompt?: string; answer_prompt?: string; model?: string } }>
      setAllStrategyNames(Object.keys(strategies))
      setRenderStrategyNames(
        Object.keys(strategies).filter((name) => !name.startsWith("activity_"))
      )
    }
    if (merged.page_sectioning && typeof merged.page_sectioning === "object") {
      const ps = merged.page_sectioning as Record<string, unknown>
      if (ps.model) setSectioningModel(String(ps.model))
      if (ps.mode) setSectioningMode(String(ps.mode))
    }
    // Styleguide
    setStyleguide(typeof merged.styleguide === "string" ? merged.styleguide : "")
    // Rendering config comes from the default render strategy
    if (merged.render_strategies && merged.default_render_strategy) {
      const strategies = merged.render_strategies as Record<string, { render_type?: string; config?: { model?: string; prompt?: string; template?: string; temperature?: number } }>
      const defaultStrategy = strategies[String(merged.default_render_strategy)]
      if (defaultStrategy?.render_type) setRenderingRenderType(defaultStrategy.render_type)
      if (defaultStrategy?.config?.model) setRenderingModel(String(defaultStrategy.config.model))
      if (defaultStrategy?.config?.prompt) setRenderingPromptName(String(defaultStrategy.config.prompt))
      if (defaultStrategy?.config?.template) {
        setRenderingTemplateName(String(defaultStrategy.config.template))
        setTemplateTabName(String(defaultStrategy.config.template))
      }
      setRenderingTemperature(defaultStrategy?.config?.temperature != null ? String(defaultStrategy.config.temperature) : "")
    }
  }, [activeConfigData])

  const [newTypeKey, setNewTypeKey] = useState("")
  const [newTypeDesc, setNewTypeDesc] = useState("")

  const togglePruned = (key: string) => {
    markDirty("pruned_section_types")
    setPrunedSectionTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const updateDescription = (key: string, description: string) => {
    markDirty("section_types")
    setSectionTypes((prev) => ({ ...prev, [key]: description }))
  }

  const updateRenderOverride = (key: string, strategy: string) => {
    markDirty("section_render_strategies")
    setSectionRenderStrategies((prev) => {
      if (!strategy) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: strategy }
    })
  }

  const removeSectionType = (key: string) => {
    markDirty("section_types")
    markDirty("pruned_section_types")
    markDirty("section_render_strategies")
    setSectionTypes((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPrunedSectionTypes((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setSectionRenderStrategies((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const addSectionType = () => {
    const key = newTypeKey.trim().toLowerCase().replace(/\s+/g, "_")
    if (!key || key in sectionTypes) return
    markDirty("section_types")
    setSectionTypes((prev) => ({ ...prev, [key]: newTypeDesc.trim() }))
    setNewTypeKey("")
    setNewTypeDesc("")
  }

  // Helper: only write a field if the user changed it or the book config already had it
  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    const merged = (activeConfigData?.merged as Record<string, unknown> | undefined)

    // Preserve all existing book config keys we don't manage
    if (bookConfigData?.config) {
      Object.assign(overrides, bookConfigData.config)
    }

    // Only write managed fields if touched or already in book config
    if (shouldWrite("section_types")) {
      // Explicitly null-out deleted keys so deepMerge removes them from base
      const baseSectionTypes = (merged?.section_types ?? {}) as Record<string, string>
      const withDeletions: Record<string, string | null> = { ...sectionTypes }
      for (const key of Object.keys(baseSectionTypes)) {
        if (!(key in sectionTypes)) withDeletions[key] = null
      }
      overrides.section_types = withDeletions
    }
    if (shouldWrite("pruned_section_types")) {
      overrides.pruned_section_types = Array.from(prunedSectionTypes)
    }
    if (shouldWrite("default_render_strategy")) {
      overrides.default_render_strategy = defaultRenderStrategy || undefined
    }
    if (shouldWrite("section_render_strategies")) {
      const baseStrategies = (merged?.section_render_strategies ?? {}) as Record<string, string>
      const stratWithDeletions: Record<string, string | null> = { ...sectionRenderStrategies }
      for (const key of Object.keys(baseStrategies)) {
        if (!(key in sectionRenderStrategies)) stratWithDeletions[key] = null
      }
      overrides.section_render_strategies = Object.keys(stratWithDeletions).length > 0
        ? stratWithDeletions
        : undefined
    }
    if (shouldWrite("page_sectioning")) {
      const existing = (bookConfigData?.config?.page_sectioning ?? {}) as Record<string, unknown>
      overrides.page_sectioning = { ...existing, model: sectioningModel.trim() || undefined, mode: sectioningMode }
    }
    if (shouldWrite("styleguide")) {
      overrides.styleguide = styleguide || undefined
    }
    // Write rendering temperature into the default render strategy config
    if (shouldWrite("rendering_temperature") && defaultRenderStrategy) {
      const existingStrategies = (overrides.render_strategies ?? merged?.render_strategies ?? {}) as Record<string, Record<string, unknown>>
      const stratCopy = JSON.parse(JSON.stringify(existingStrategies)) as Record<string, Record<string, unknown>>
      if (stratCopy[defaultRenderStrategy]) {
        const cfg = (stratCopy[defaultRenderStrategy].config ?? {}) as Record<string, unknown>
        cfg.temperature = renderingTemperature.trim() ? Number(renderingTemperature) : undefined
        stratCopy[defaultRenderStrategy].config = cfg
        overrides.render_strategies = stratCopy
      }
    }
    // Write activity model into the activity render strategy config
    if (shouldWrite("activity_model") && activityStrategyName) {
      if (!overrides.render_strategies) {
        overrides.render_strategies = JSON.parse(JSON.stringify(merged?.render_strategies ?? {}))
      }
      const stratCopy = overrides.render_strategies as Record<string, Record<string, unknown>>
      if (stratCopy[activityStrategyName]) {
        const cfg = (stratCopy[activityStrategyName].config ?? {}) as Record<string, unknown>
        cfg.model = activityModel.trim() || undefined
        stratCopy[activityStrategyName].config = cfg
      }
    }

    return overrides
  }

  const confirmSaveAndRerun = async () => {
    // Save any edited prompts/templates first
    const contentSaves: Promise<unknown>[] = []
    if (sectioningPromptDraft != null) contentSaves.push(api.updatePrompt("page_sectioning", sectioningPromptDraft, bookLabel))
    if (renderingPromptDraft != null) contentSaves.push(api.updatePrompt(renderingPromptName, renderingPromptDraft, bookLabel))
    if (renderingTemplateDraft != null) contentSaves.push(api.updateTemplate(renderingTemplateName, renderingTemplateDraft, bookLabel))
    if (templateTabDraft != null && templateTabName) contentSaves.push(api.updateTemplate(templateTabName, templateTabDraft, bookLabel))
    if (activityPromptDraft != null && selectedActivity?.prompt) contentSaves.push(api.updatePrompt(selectedActivity.prompt, activityPromptDraft, bookLabel))
    if (activityAnswerDraft != null && selectedActivity?.answer_prompt) contentSaves.push(api.updatePrompt(selectedActivity.answer_prompt, activityAnswerDraft, bookLabel))
    if (imageGenPromptDraft != null) contentSaves.push(api.updatePrompt("ai_image_generation", imageGenPromptDraft, bookLabel))
    if (contentSaves.length > 0) await Promise.all(contentSaves)

    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: async () => {
          setDirty({})
          setSectioningPromptDraft(null)
          setRenderingPromptDraft(null)
          setRenderingTemplateDraft(null)
          setTemplateTabDraft(null)
          setActivityPromptDraft(null)
          setActivityAnswerDraft(null)
          setImageGenPromptDraft(null)
          setShowRerunDialog(false)
          // Start step-scoped storyboard run — blocks until data is cleared on backend
          startRun("storyboard", "storyboard")
          setSseEnabled(true)
          await api.runSteps(bookLabel, apiKey, { fromStep: "storyboard", toStep: "storyboard" })
          // Remove cached data so the storyboard page shows empty state (not stale pages)
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "pages"] })
          queryClient.removeQueries({ queryKey: ["books", bookLabel] })
          // Navigate to the storyboard view
          navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: "storyboard" } })
        },
      }
    )
  }

  // Image gen prompt is on-demand (not pipeline) — save without triggering a rerun
  const saveImageGenPrompt = async () => {
    if (imageGenPromptDraft == null) return
    setSavingImageGenPrompt(true)
    try {
      await api.updatePrompt("ai_image_generation", imageGenPromptDraft, bookLabel)
      setImageGenPromptDraft(null)
    } finally {
      setSavingImageGenPrompt(false)
    }
  }

  return (
    <div className={tab === "sectioning-prompt" || tab === "rendering-prompt" || tab === "rendering-template" || tab === "activity-prompts" || tab === "image-generation" ? "h-full" : "p-4 space-y-6"}>
      {tab === "general" && (
        <>
          {/* Default Render Strategy */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Default Render Strategy
            </h3>
            <Select
              value={defaultRenderStrategy}
              onValueChange={(v) => {
                setDefaultRenderStrategy(v)
                markDirty("default_render_strategy")
                // Update rendering config to match the newly selected strategy
                const merged = activeConfigData?.merged as Record<string, unknown> | undefined
                const strategies = (merged?.render_strategies ?? {}) as Record<string, { render_type?: string; config?: { model?: string; prompt?: string; template?: string } }>
                const strat = strategies[v]
                if (strat) {
                  if (strat.render_type) setRenderingRenderType(strat.render_type)
                  if (strat.config?.prompt) setRenderingPromptName(strat.config.prompt)
                  if (strat.config?.model) setRenderingModel(strat.config.model)
                  if (strat.config?.template) {
                    setRenderingTemplateName(strat.config.template)
                    setTemplateTabName(strat.config.template)
                    setTemplateTabDraft(null)
                  }
                } else {
                  // Synthetic option like "dynamic" — clear stale rendering config
                  setRenderingRenderType("")
                  setRenderingModel("")
                  setRenderingPromptName("")
                  setRenderingTemplateName("")
                  setTemplateTabName("")
                  setTemplateTabDraft(null)
                }
              }}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select strategy...">
                  {defaultRenderStrategy && (
                    <>
                      {strategyDisplayName(defaultRenderStrategy)}
                      {strategyRenderTypes[defaultRenderStrategy] === "template" && (
                        <span className="text-muted-foreground ml-1">(template)</span>
                      )}
                    </>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {["dynamic", ...renderStrategyNames.filter((n) => n !== "dynamic")].map((name) => {
                  const isTemplate = strategyRenderTypes[name] === "template"
                  return (
                    <SelectItem key={name} value={name}>
                      <div className="flex flex-col items-start">
                        <span>
                          {strategyDisplayName(name)}
                          {isTemplate && <span className="text-muted-foreground ml-1">(template)</span>}
                        </span>
                        {RENDER_STRATEGY_DESCRIPTIONS[name] && (
                          <span className="text-xs text-muted-foreground">
                            {RENDER_STRATEGY_DESCRIPTIONS[name]}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">
              The rendering strategy used for sections without an explicit mapping.
            </p>
          </div>

          {/* Section Types */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Section Types
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Types used during page sectioning. Pruned types are excluded from rendering.
            </p>
            <div className="rounded-md border divide-y">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50">
                <span className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs font-medium text-muted-foreground shrink-0 w-40">Type</span>
                <span className="text-xs font-medium text-muted-foreground flex-1 min-w-0">Description</span>
                <span className="text-xs font-medium text-muted-foreground shrink-0 w-48 text-left">Render Strategy</span>
                <span className="shrink-0 w-5" />
              </div>
              {Object.entries(sectionTypes).map(([key, description]) => {
                const pruned = prunedSectionTypes.has(key)
                const renderOverride = sectionRenderStrategies[key] ?? ""
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-3 py-1.5 group ${pruned ? "bg-muted/30" : ""}`}
                  >
                    <PruneToggle pruned={pruned} onToggle={() => togglePruned(key)} />
                    <span className={`text-xs shrink-0 w-40 truncate font-mono ${pruned ? "text-muted-foreground line-through" : "font-medium"}`}>
                      {key}
                    </span>
                    <Input
                      value={description}
                      onChange={(e) => updateDescription(key, e.target.value)}
                      className="h-7 text-xs flex-1 min-w-0"
                      placeholder="Description..."
                    />
                    <Select
                      value={renderOverride || "__default__"}
                      onValueChange={(v) => updateRenderOverride(key, v === "__default__" ? "" : v)}
                    >
                      <SelectTrigger className="h-7 w-48 shrink-0 text-xs text-left">
                        <SelectValue>
                          {renderOverride ? strategyDisplayName(renderOverride) : "Default"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="__default__">
                          <span className="text-muted-foreground">Default</span>
                        </SelectItem>
                        {allStrategyNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {strategyDisplayName(name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => removeSectionType(key)}
                      className="shrink-0 p-0.5 rounded text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive transition-colors"
                      title="Remove type"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
              {/* Add new type */}
              <div className="flex items-center gap-2 px-3 py-1.5">
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  value={newTypeKey}
                  onChange={(e) => setNewTypeKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSectionType()}
                  className="h-7 text-xs w-40 shrink-0"
                  placeholder="new_type_key"
                />
                <Input
                  value={newTypeDesc}
                  onChange={(e) => setNewTypeDesc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSectionType()}
                  className="h-7 text-xs flex-1 min-w-0"
                  placeholder="Description..."
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={addSectionType}
                  disabled={!newTypeKey.trim() || newTypeKey.trim().toLowerCase().replace(/\s+/g, "_") in sectionTypes}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "sectioning-prompt" && (
        <div className="flex flex-col h-full">
          <div className="shrink-0 p-4 pb-0 space-y-4">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Sectioning Mode
              </h3>
              <Select
                value={sectioningMode}
                onValueChange={(v) => {
                  setSectioningMode(v)
                  markDirty("page_sectioning")
                }}
              >
                <SelectTrigger className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="section">
                    <div className="flex flex-col items-start">
                      <span>By Section</span>
                      <span className="text-xs text-muted-foreground">
                        Groups content into logical sections
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="page">
                    <div className="flex flex-col items-start">
                      <span>By Page</span>
                      <span className="text-xs text-muted-foreground">
                        Treats each page as a single section
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Controls how page content is grouped during the sectioning step.
              </p>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <PromptViewer
              promptName="page_sectioning"
              bookLabel={bookLabel}
              title="Page Sectioning Prompt"
              description="The prompt template used to split each page into logical sections. This is a Liquid template processed with page context."
              model={sectioningModel}
              onModelChange={(v) => { setSectioningModel(v); markDirty("page_sectioning") }}
              onContentChange={setSectioningPromptDraft}
            />
          </div>
        </div>
      )}

      {tab === "rendering-prompt" && (
        <div className="flex flex-col h-full">
          {/* Styleguide + Temperature settings */}
          <div className="shrink-0 p-4 pb-0 space-y-4">
            {availableStyleguides.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Styleguide
                </h3>
                <div className="flex items-center gap-2">
                  <Select
                    value={styleguide || "__none__"}
                    onValueChange={(v) => {
                      setStyleguide(v === "__none__" ? "" : v)
                      markDirty("styleguide")
                    }}
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Select styleguide...">
                        {styleguide ? titleCase(styleguide) : "None"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">None</span>
                      </SelectItem>
                      {availableStyleguides.map((sg) => (
                        <SelectItem key={sg} value={sg}>
                          {titleCase(sg)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {styleguide && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-2.5 shrink-0"
                      onClick={openStyleguidePreview}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Preview
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Provides consistent HTML/CSS patterns for LLM-generated pages.
                </p>
              </div>
            )}

            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Temperature
              </h3>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={renderingTemperature}
                  onChange={(e) => {
                    setRenderingTemperature(e.target.value)
                    markDirty("rendering_temperature")
                  }}
                  placeholder="0.3"
                  className="h-9 w-24 text-sm"
                />
                <Label className="text-xs text-muted-foreground">
                  0 = deterministic, 2 = max creativity
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Lower values produce more consistent styling across pages.
              </p>
            </div>
          </div>

          {/* Prompt editor */}
          <div className="flex-1 min-h-0">
            <PromptViewer
              promptName={renderingPromptName}
              bookLabel={bookLabel}
              title="Rendering Prompt"
              description="The prompt template used to generate HTML for each section. This is a Liquid template processed with section context."
              model={renderingModel}
              onModelChange={(v) => { setRenderingModel(v); markDirty("rendering_model") }}
              onContentChange={setRenderingPromptDraft}
            />
          </div>
        </div>
      )}

      {tab === "rendering-template" && (
        <div className="flex flex-col h-full p-4 gap-4">
          <div className="shrink-0">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Template Rendering
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Browse and edit Liquid templates used for template-based rendering strategies.
            </p>
            <Select
              value={templateTabName || "__none__"}
              onValueChange={(v) => {
                setTemplateTabName(v === "__none__" ? "" : v)
                setTemplateTabDraft(null)
              }}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select template...">
                  {templateTabName ? (
                    <>
                      {titleCase(templateTabName)}
                      {renderingRenderType === "template" && templateTabName === renderingTemplateName && (
                        <span className="text-emerald-600 ml-1">(active)</span>
                      )}
                    </>
                  ) : "Select template..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {availableTemplates.map((name) => {
                  const isActive = renderingRenderType === "template" && name === renderingTemplateName
                  return (
                    <SelectItem key={name} value={name}>
                      {titleCase(name)}
                      {isActive && <span className="text-emerald-600 ml-1">(active)</span>}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          {templateTabName && (
            <div className="flex-1 min-h-0">
              <TemplateViewer
                templateName={templateTabName}
                bookLabel={bookLabel}
                title={titleCase(templateTabName)}
                description="Edit the Liquid/HTML template below. Changes are saved when you click Save & Rerun."
                onContentChange={setTemplateTabDraft}
              />
            </div>
          )}
        </div>
      )}

      {tab === "activity-prompts" && (() => {
        const activityNames = Object.keys(activityStrategies)
        // Activities are enabled when their section types are NOT pruned and render strategies are mapped
        const allEnabled = activityNames.length > 0 &&
          activityNames.every((name) => sectionRenderStrategies[name] === name) &&
          !activityNames.some((name) => prunedSectionTypes.has(name))
        return (
        <div className="flex flex-col h-full">
          <div className="shrink-0 p-4 pb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Activity Rendering
            </h3>

            {/* Universal enable/disable toggle */}
            <div className="flex items-center gap-3 mb-4">
              <Switch
                checked={allEnabled}
                onCheckedChange={(checked) => {
                  // 1. Toggle section_render_strategies — maps activity section types to their strategies
                  markDirty("section_render_strategies")
                  setSectionRenderStrategies((prev) => {
                    const next = { ...prev }
                    for (const name of activityNames) {
                      if (checked) {
                        next[name] = name
                      } else {
                        delete next[name]
                      }
                    }
                    return next
                  })
                  // 2. Toggle pruned_section_types — hides activity types from the page classifier
                  markDirty("pruned_section_types")
                  setPrunedSectionTypes((prev) => {
                    const next = new Set(prev)
                    for (const name of activityNames) {
                      if (checked) {
                        next.delete(name)
                      } else {
                        next.add(name)
                      }
                    }
                    return next
                  })
                }}
              />
              <Label className="text-xs">
                {allEnabled ? "Activities enabled" : "Activities disabled"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {allEnabled
                  ? "Activity section types are available for classification and rendering."
                  : "Activity section types are hidden from the classifier and skipped during rendering."}
              </p>
            </div>

            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Edit Prompts
            </h3>
            <Select
              value={activityStrategyName || "__none__"}
              onValueChange={(v) => {
                const name = v === "__none__" ? "" : v
                setActivityStrategyName(name)
                setActivityPromptDraft(null)
                setActivityAnswerDraft(null)
                setActivityModel(name ? (activityStrategies[name]?.model ?? "") : "")
              }}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select activity type...">
                  {activityStrategyName ? titleCase(activityStrategyName.replace(/^activity_/, "")) : "Select activity type..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {activityNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {titleCase(name.replace(/^activity_/, ""))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedActivity && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="min-h-[400px] h-[50vh]">
                <PromptViewer
                  key={`${activityStrategyName}-gen`}
                  promptName={selectedActivity.prompt}
                  bookLabel={bookLabel}
                  title="Generation Prompt"
                  description="Generates the interactive HTML for this activity type."
                  model={activityModel}
                  onModelChange={(v) => { setActivityModel(v); markDirty("activity_model") }}
                  onContentChange={setActivityPromptDraft}
                />
              </div>
              {selectedActivity.answer_prompt && (
                <div className="min-h-[400px] h-[50vh] border-t">
                  <PromptViewer
                    key={`${activityStrategyName}-ans`}
                    promptName={selectedActivity.answer_prompt}
                    bookLabel={bookLabel}
                    title="Answer Prompt"
                    description="Extracts the correct answer key from the generated activity HTML."
                    model={activityModel}
                    onModelChange={(v) => { setActivityModel(v); markDirty("activity_model") }}
                    onContentChange={setActivityAnswerDraft}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        )
      })()}

      {tab === "image-generation" && (
        <div className="h-full">
          <PromptViewer
            promptName="ai_image_generation"
            bookLabel={bookLabel}
            title="Image Generation Prompt"
            description="Wraps every AI image generation request — define style guidelines and rules here, then use {{ user_prompt }} where the per-image request should be injected."
            hideModel
            onContentChange={setImageGenPromptDraft}
          />
        </div>
      )}

      {headerTarget && createPortal(
        tab === "image-generation" ? (
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs bg-black/15 text-white hover:bg-black/25"
            onClick={saveImageGenPrompt}
            disabled={savingImageGenPrompt || imageGenPromptDraft == null}
          >
            {savingImageGenPrompt ? "Saving..." : "Save"}
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs bg-black/15 text-white hover:bg-black/25"
            onClick={() => setShowRerunDialog(true)}
            disabled={updateConfig.isPending || !hasApiKey}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Save &amp; Rerun
          </Button>
        ),
        headerTarget
      )}

      <Dialog open={styleguidePreviewOpen} onOpenChange={setStyleguidePreviewOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>Styleguide Preview — {styleguide}</DialogTitle>
            <DialogDescription>
              Preview of the HTML/CSS patterns used for LLM-generated pages.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-6">
            {styleguidePreviewLoading ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Loading preview...
              </div>
            ) : (
              <iframe
                srcDoc={previewData?.html ?? ""}
                className="w-full h-full rounded-md border"
                sandbox="allow-scripts"
                title="Styleguide Preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRerunDialog} onOpenChange={setShowRerunDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save &amp; Rerun Storyboard</DialogTitle>
            <DialogDescription>
              This will save your settings and re-run the storyboard pipeline.
              Sectioning and rendering will be regenerated for all pages.
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
