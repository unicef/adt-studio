import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Play, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PruneToggle } from "@/components/v2/PruneToggle"
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
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/v2/PromptViewer"
import { useStepRun } from "@/hooks/use-step-run"

/** "two_column_story" → "Two Column Story" */
function titleCase(slug: string): string {
  return slug.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

const RENDER_STRATEGY_DESCRIPTIONS: Record<string, string> = {
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

  // Form state
  const [sectionTypes, setSectionTypes] = useState<Record<string, string>>({})
  const [prunedSectionTypes, setPrunedSectionTypes] = useState<Set<string>>(new Set())
  const [sectionRenderStrategies, setSectionRenderStrategies] = useState<Record<string, string>>({})
  const [defaultRenderStrategy, setDefaultRenderStrategy] = useState("")
  const [allStrategyNames, setAllStrategyNames] = useState<string[]>([])
  const [renderStrategyNames, setRenderStrategyNames] = useState<string[]>([])
  const [sectioningModel, setSectioningModel] = useState("")
  const [renderingModel, setRenderingModel] = useState("")
  const [renderingPromptName, setRenderingPromptName] = useState("web_generation_html")
  const [sectioningPromptDraft, setSectioningPromptDraft] = useState<string | null>(null)
  const [renderingPromptDraft, setRenderingPromptDraft] = useState<string | null>(null)

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
      const strategies = merged.render_strategies as Record<string, { render_type?: string }>
      setAllStrategyNames(Object.keys(strategies))
      setRenderStrategyNames(
        Object.keys(strategies).filter((name) => !name.startsWith("activity_"))
      )
    }
    if (merged.page_sectioning && typeof merged.page_sectioning === "object") {
      const ps = merged.page_sectioning as Record<string, unknown>
      if (ps.model) setSectioningModel(String(ps.model))
    }
    // Rendering model + prompt come from the default render strategy's config
    if (merged.render_strategies && merged.default_render_strategy) {
      const strategies = merged.render_strategies as Record<string, { config?: { model?: string; prompt?: string } }>
      const defaultStrategy = strategies[String(merged.default_render_strategy)]
      if (defaultStrategy?.config?.model) {
        setRenderingModel(String(defaultStrategy.config.model))
      }
      if (defaultStrategy?.config?.prompt) {
        setRenderingPromptName(String(defaultStrategy.config.prompt))
      }
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

    // Preserve all existing book config keys we don't manage
    if (bookConfigData?.config) {
      Object.assign(overrides, bookConfigData.config)
    }

    // Only write managed fields if touched or already in book config
    if (shouldWrite("section_types")) {
      overrides.section_types = sectionTypes
    }
    if (shouldWrite("pruned_section_types")) {
      overrides.pruned_section_types = Array.from(prunedSectionTypes)
    }
    if (shouldWrite("default_render_strategy")) {
      overrides.default_render_strategy = defaultRenderStrategy || undefined
    }
    if (shouldWrite("section_render_strategies")) {
      overrides.section_render_strategies = Object.keys(sectionRenderStrategies).length > 0
        ? sectionRenderStrategies
        : undefined
    }
    if (shouldWrite("page_sectioning")) {
      const existing = (bookConfigData?.config?.page_sectioning ?? {}) as Record<string, unknown>
      overrides.page_sectioning = { ...existing, model: sectioningModel.trim() || undefined }
    }

    return overrides
  }

  const confirmSaveAndRerun = async () => {
    // Save any edited prompts first
    const promptSaves: Promise<unknown>[] = []
    if (sectioningPromptDraft != null) promptSaves.push(api.updatePrompt("page_sectioning", sectioningPromptDraft, bookLabel))
    if (renderingPromptDraft != null) promptSaves.push(api.updatePrompt(renderingPromptName, renderingPromptDraft, bookLabel))
    if (promptSaves.length > 0) await Promise.all(promptSaves)

    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: async () => {
          setDirty({})
          setSectioningPromptDraft(null)
          setRenderingPromptDraft(null)
          setShowRerunDialog(false)
          // Start step-scoped storyboard run — blocks until data is cleared on backend
          startRun("storyboard", "storyboard")
          setSseEnabled(true)
          await api.runSteps(bookLabel, apiKey, { fromStep: "storyboard", toStep: "storyboard" })
          // Remove cached data so the storyboard page shows empty state (not stale pages)
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "pages"] })
          queryClient.removeQueries({ queryKey: ["books", bookLabel] })
          // Navigate to the storyboard view
          navigate({ to: "/books/$label/v2/$step", params: { label: bookLabel, step: "storyboard" } })
        },
      }
    )
  }

  return (
    <div className={tab === "sectioning-prompt" || tab === "rendering-prompt" ? "h-full max-w-4xl" : "p-4 space-y-6"}>
      {tab === "general" && (
        <>
          {/* Default Render Strategy */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Default Render Strategy
            </h3>
            <Select
              value={defaultRenderStrategy}
              onValueChange={(v) => { setDefaultRenderStrategy(v); markDirty("default_render_strategy") }}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select strategy...">
                  {defaultRenderStrategy && titleCase(defaultRenderStrategy)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {renderStrategyNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    <div className="flex flex-col items-start">
                      <span>{titleCase(name)}</span>
                      {RENDER_STRATEGY_DESCRIPTIONS[name] && (
                        <span className="text-xs text-muted-foreground">
                          {RENDER_STRATEGY_DESCRIPTIONS[name]}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
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
                          {renderOverride ? titleCase(renderOverride) : "Default"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="__default__">
                          <span className="text-muted-foreground">Default</span>
                        </SelectItem>
                        {allStrategyNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {titleCase(name)}
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
        <PromptViewer
          promptName="page_sectioning"
          bookLabel={bookLabel}
          title="Page Sectioning Prompt"
          description="The prompt template used to split each page into logical sections. This is a Liquid template processed with page context."
          model={sectioningModel}
          onModelChange={(v) => { setSectioningModel(v); markDirty("page_sectioning") }}
          onContentChange={setSectioningPromptDraft}
        />
      )}

      {tab === "rendering-prompt" && (
        <PromptViewer
          promptName={renderingPromptName}
          bookLabel={bookLabel}
          title="Rendering Prompt"
          description="The prompt template used to generate HTML for each section. This is a Liquid template processed with section context."
          model={renderingModel}
          onModelChange={(v) => { setRenderingModel(v); markDirty("rendering_model") }}
          onContentChange={setRenderingPromptDraft}
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
