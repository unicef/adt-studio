import { useState, useEffect, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PruneToggle } from "@/components/pipeline/components/PruneToggle"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { PromptViewer, savePromptDraft, toPromptDraft, type PromptDraft } from "@/components/pipeline/components/PromptViewer"
import { useStageSettingsBar } from "@/hooks/use-stage-settings-bar"
import { useDirtyTabTracker } from "@/hooks/use-settings-dirty-tabs"
import { useStepConfig } from "@/hooks/use-step-config"
import { Trans } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { listSelectableRenderStrategies } from "@/lib/render-strategy"
import { getSectionTypeLabel } from "@/lib/section-constants"
import { cn } from "@/lib/utils"

const PROMPT_TABS = ["sectioning-prompt", "refinement-prompt"]

function PageModeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <rect x="3" y="2" width="18" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="7" x2="17" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7" y1="10.5" x2="14" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="7" y="13" width="10" height="5" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  )
}

function DynamicModeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <rect x="3" y="2" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="5.5" x2="17" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="3" y="11" width="18" height="5" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <rect x="3" y="18" width="18" height="4" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
  )
}

const STRATEGY_LABEL_MSGS: Record<string, ReturnType<typeof msg>> = {
  llm: msg`AI Generated`,
  "llm-overlay": msg`AI Overlay`,
}

function titleCase(slug: string): string {
  return slug.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function strategyDisplayName(slug: string): string {
  const descriptor = STRATEGY_LABEL_MSGS[slug]
  if (descriptor) return i18n._(descriptor)
  return titleCase(slug.replace(/_/g, " "))
}

function getSectionTypeDisplayLabel(value: string): string {
  const label = getSectionTypeLabel(value)
  return label || value.replace(/_/g, " ")
}

export function SectioningSettings({ bookLabel, tab = "section-types" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const queryClient = useQueryClient()

  // Section Types state
  const [sectionTypes, setSectionTypes] = useState<Record<string, string>>({})
  const [prunedSectionTypes, setPrunedSectionTypes] = useState<Set<string>>(new Set())
  const [disabledSectionTypes, setDisabledSectionTypes] = useState<Set<string>>(new Set())
  const [sectionRenderStrategies, setSectionRenderStrategies] = useState<Record<string, string>>({})
  const [allStrategyNames, setAllStrategyNames] = useState<string[]>([])

  // Structure Types state
  const [structureTypes, setStructureTypes] = useState<Record<string, string>>({})
  // Text (role) Types state
  const [roleTypes, setRoleTypes] = useState<Record<string, string>>({})
  const [prunedRoleTypes, setPrunedRoleTypes] = useState<Set<string>>(new Set())

  // Activities on/off — a single flag honored by sectioning and web-rendering
  // (via the `activity_` prefix), so it never drifts from a per-type list.
  const [generateActivities, setGenerateActivities] = useState(true)

  // Sectioning state
  const [sectioningMode, setSectioningMode] = useState("dynamic")
  const [maxRefinements, setMaxRefinements] = useState("")
  const [sectioningPromptDraft, setSectioningPromptDraft] = useState<PromptDraft | null>(null)
  const [refinementPromptDraft, setRefinementPromptDraft] = useState<PromptDraft | null>(null)

  // Track dirty state
  const { markedTabs, markTab, resetMarkedTabs } = useDirtyTabTracker()
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => {
    setDirty((prev) => ({ ...prev, [field]: true }))
    markTab(tab)
  }

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const sectioning = useStepConfig(merged, "page_sectioning", markDirty)

  // Load from merged config
  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    if (m.section_types && typeof m.section_types === "object") {
      setSectionTypes(m.section_types as Record<string, string>)
    }
    if (Array.isArray(m.pruned_section_types)) {
      setPrunedSectionTypes(new Set(m.pruned_section_types as string[]))
    }
    if (Array.isArray(m.disabled_section_types)) {
      setDisabledSectionTypes(new Set(m.disabled_section_types as string[]))
    }
    if (m.section_render_strategies && typeof m.section_render_strategies === "object") {
      setSectionRenderStrategies(m.section_render_strategies as Record<string, string>)
    }
    if (m.structure_types && typeof m.structure_types === "object") {
      setStructureTypes(m.structure_types as Record<string, string>)
    }
    if (m.role_types && typeof m.role_types === "object") {
      setRoleTypes(m.role_types as Record<string, string>)
    }
    if (Array.isArray(m.pruned_role_types)) {
      setPrunedRoleTypes(new Set(m.pruned_role_types as string[]))
    }
    const strategies = (
      m.render_strategies && typeof m.render_strategies === "object" ? m.render_strategies : {}
    ) as Record<string, { render_type?: string; config?: Record<string, unknown> }>
    setAllStrategyNames(listSelectableRenderStrategies(strategies))

    if (m.page_sectioning && typeof m.page_sectioning === "object") {
      const ps = m.page_sectioning as Record<string, unknown>
      if (ps.mode) setSectioningMode(String(ps.mode))
      setMaxRefinements(ps.max_refinements != null ? String(ps.max_refinements) : "")
    }
    setGenerateActivities(m.generate_activities !== false)
  }, [activeConfigData])

  // Section Types handlers
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

  const updateSectionDescription = (key: string, description: string) => {
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

  const toggleDisabled = (key: string) => {
    markDirty("disabled_section_types")
    setDisabledSectionTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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

  // Structure Types handlers
  const [newStructKey, setNewStructKey] = useState("")
  const [newStructDesc, setNewStructDesc] = useState("")

  const updateStructureDescription = (key: string, description: string) => {
    markDirty("structure_types")
    setStructureTypes((prev) => ({ ...prev, [key]: description }))
  }

  const removeStructureType = (key: string) => {
    markDirty("structure_types")
    setStructureTypes((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const addStructureType = () => {
    const key = newStructKey.trim().toLowerCase().replace(/\s+/g, "_")
    if (!key || key in structureTypes) return
    markDirty("structure_types")
    setStructureTypes((prev) => ({ ...prev, [key]: newStructDesc.trim() }))
    setNewStructKey("")
    setNewStructDesc("")
  }

  // Text (role) Types handlers
  const [newRoleKey, setNewRoleKey] = useState("")
  const [newRoleDesc, setNewRoleDesc] = useState("")

  const updateRoleDescription = (key: string, description: string) => {
    markDirty("role_types")
    setRoleTypes((prev) => ({ ...prev, [key]: description }))
  }

  const togglePrunedRole = (key: string) => {
    markDirty("pruned_role_types")
    setPrunedRoleTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const removeRoleType = (key: string) => {
    markDirty("role_types")
    setRoleTypes((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const addRoleType = () => {
    const key = newRoleKey.trim().toLowerCase().replace(/\s+/g, "_")
    if (!key || key in roleTypes) return
    markDirty("role_types")
    setRoleTypes((prev) => ({ ...prev, [key]: newRoleDesc.trim() }))
    setNewRoleKey("")
    setNewRoleDesc("")
  }

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    const m = (activeConfigData?.merged as Record<string, unknown> | undefined)

    if (bookConfigData?.config) {
      Object.assign(overrides, bookConfigData.config)
    }

    if (shouldWrite("section_types")) {
      const baseSectionTypes = (m?.section_types ?? {}) as Record<string, string>
      const withDeletions: Record<string, string | null> = { ...sectionTypes }
      for (const key of Object.keys(baseSectionTypes)) {
        if (!(key in sectionTypes)) withDeletions[key] = null
      }
      overrides.section_types = withDeletions
    }
    if (shouldWrite("pruned_section_types")) {
      overrides.pruned_section_types = Array.from(prunedSectionTypes)
    }
    if (shouldWrite("disabled_section_types")) {
      overrides.disabled_section_types = Array.from(disabledSectionTypes)
    }
    if (shouldWrite("generate_activities")) {
      overrides.generate_activities = generateActivities
    }
    if (shouldWrite("section_render_strategies")) {
      const baseStrategies = (m?.section_render_strategies ?? {}) as Record<string, string>
      const stratWithDeletions: Record<string, string | null> = { ...sectionRenderStrategies }
      for (const key of Object.keys(baseStrategies)) {
        if (!(key in sectionRenderStrategies)) stratWithDeletions[key] = null
      }
      overrides.section_render_strategies = Object.keys(stratWithDeletions).length > 0
        ? stratWithDeletions
        : undefined
    }
    if (shouldWrite("structure_types")) {
      const baseStructureTypes = (m?.structure_types ?? {}) as Record<string, string>
      const withDeletions: Record<string, string | null> = { ...structureTypes }
      for (const key of Object.keys(baseStructureTypes)) {
        if (!(key in structureTypes)) withDeletions[key] = null
      }
      overrides.structure_types = withDeletions
    }
    if (shouldWrite("role_types")) {
      const baseRoleTypes = (m?.role_types ?? {}) as Record<string, string>
      const withDeletions: Record<string, string | null> = { ...roleTypes }
      for (const key of Object.keys(baseRoleTypes)) {
        if (!(key in roleTypes)) withDeletions[key] = null
      }
      overrides.role_types = withDeletions
    }
    if (shouldWrite("pruned_role_types")) {
      overrides.pruned_role_types = Array.from(prunedRoleTypes)
    }
    if (shouldWrite("page_sectioning") || shouldWrite("max_refinements")) {
      const existing = (bookConfigData?.config?.page_sectioning ?? {}) as Record<string, unknown>
      const ps: Record<string, unknown> = { ...existing, ...sectioning.configOverrides, mode: sectioningMode }
      if (shouldWrite("max_refinements")) {
        ps.max_refinements = maxRefinements.trim() ? Number(maxRefinements) : undefined
      }
      overrides.page_sectioning = ps
    }

    return overrides
  }

  const save = async () => {
    if (sectioningPromptDraft != null) {
      await savePromptDraft(queryClient, "page_sectioning", bookLabel, sectioningPromptDraft)
    }
    if (refinementPromptDraft != null) {
      await savePromptDraft(queryClient, "page_sectioning_refinement", bookLabel, refinementPromptDraft)
    }

    await updateConfig.mutateAsync({ label: bookLabel, config: buildOverrides() })
    setDirty({})
    setSectioningPromptDraft(null)
    setRefinementPromptDraft(null)
    resetMarkedTabs()
  }

  const dirtyTabs = [
    ...markedTabs,
    ...(sectioningPromptDraft != null ? ["sectioning-prompt"] : []),
    ...(refinementPromptDraft != null ? ["refinement-prompt"] : []),
  ].filter((tabKey, i, all) => all.indexOf(tabKey) === i)

  useStageSettingsBar({
    stage: "sectioning",
    bookLabel,
    dirty: dirtyTabs.length > 0,
    dirtyTabs,
    saving: updateConfig.isPending,
    save,
    showSaveOnly: PROMPT_TABS.includes(tab),
  })

  const activityNames = useMemo(() => {
    const strategies = (merged?.render_strategies ?? {}) as Record<string, { render_type?: string }>
    const names = new Set<string>()
    for (const key of Object.keys(sectionTypes)) {
      if (key.startsWith("activity_")) names.add(key)
    }
    for (const [name, strat] of Object.entries(strategies)) {
      if (strat?.render_type === "activity") names.add(name)
    }
    return Array.from(names)
  }, [merged, sectionTypes])

  const hasActivityTypes = activityNames.length > 0

  const toggleAllActivities = (enabled: boolean) => {
    markDirty("generate_activities")
    setGenerateActivities(enabled)
  }

  const orderedStructureEntries = useMemo(
    () => Object.entries(structureTypes).sort(([a], [b]) => a.localeCompare(b)),
    [structureTypes]
  )

  const orderedRoleEntries = useMemo(
    () => Object.entries(roleTypes).sort(([a], [b]) => a.localeCompare(b)),
    [roleTypes]
  )

  return (
    <div className={tab === "sectioning-prompt" || tab === "refinement-prompt" ? "h-full" : "p-4 space-y-6"}>
      {tab === "section-types" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {<Trans>Sectioning Mode</Trans>}
            </h3>
            <div
              role="radiogroup"
              aria-label={t`Sectioning mode`}
              className="grid grid-cols-2 gap-3 max-w-xl"
            >
              {[
                {
                  value: "dynamic",
                  Icon: DynamicModeIcon,
                  title: <Trans>Dynamic</Trans>,
                  description: (
                    <Trans>Keeps pages whole unless mixed activity types require splitting.</Trans>
                  ),
                },
                {
                  value: "page",
                  Icon: PageModeIcon,
                  title: <Trans>By Page</Trans>,
                  description: <Trans>Treats each page as a single section.</Trans>,
                },
              ].map(({ value, Icon, title, description }) => {
                const selected = sectioningMode === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setSectioningMode(value)
                      markDirty("page_sectioning")
                    }}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-3 text-left transition",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted/40"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-6 shrink-0 mt-0.5",
                        selected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium">{title}</span>
                      <span className="text-xs text-muted-foreground leading-snug">
                        {description}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {<Trans>Controls how page content is grouped during the sectioning step.</Trans>}
            </p>
          </div>

          <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {<Trans>Section Types</Trans>}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {<Trans>Types used during page sectioning. Pruned types are classified but excluded from rendering. Disabled types are hidden from the LLM entirely.</Trans>}
          </p>
          {hasActivityTypes && (
            <div className="flex items-center gap-3 mb-3">
              <Switch
                checked={generateActivities}
                onCheckedChange={toggleAllActivities}
              />
              <Label className="text-xs">
                {generateActivities ? <Trans>Activities enabled</Trans> : <Trans>Activities disabled</Trans>}
              </Label>
              <p className="text-xs text-muted-foreground">
                {generateActivities
                  ? <Trans>Activity section types are available for classification and rendering.</Trans>
                  : <Trans>Activity section types are hidden from the classifier and skipped during rendering.</Trans>}
              </p>
            </div>
          )}
          <div className="rounded-md border divide-y">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50">
              <span className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium text-muted-foreground shrink-0 w-40">{<Trans>Type</Trans>}</span>
              <span className="text-xs font-medium text-muted-foreground flex-1 min-w-0">{<Trans>Description</Trans>}</span>
              <span className="text-xs font-medium text-muted-foreground shrink-0 w-48 text-left">{<Trans>Render Strategy</Trans>}</span>
              <span className="shrink-0 w-5" />
            </div>
            {Object.entries(sectionTypes).map(([key, description]) => {
              const pruned = prunedSectionTypes.has(key)
              const disabled =
                disabledSectionTypes.has(key) ||
                (!generateActivities && key.startsWith("activity_"))
              const renderOverride = sectionRenderStrategies[key] ?? ""
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 px-3 py-1.5 group ${disabled ? "opacity-50" : pruned ? "bg-muted/30" : ""}`}
                >
                  <PruneToggle pruned={pruned} onToggle={() => togglePruned(key)} />
                  <span className={`text-xs shrink-0 w-40 truncate font-mono ${disabled ? "text-muted-foreground line-through" : pruned ? "text-muted-foreground line-through" : "font-medium"}`}>
                    {getSectionTypeDisplayLabel(key)}
                  </span>
                  <Input
                    value={description}
                    onChange={(e) => updateSectionDescription(key, e.target.value)}
                    className="h-7 text-xs flex-1 min-w-0"
                    placeholder={t`Description...`}
                  />
                  <Select
                    value={renderOverride || "__default__"}
                    onValueChange={(v) => updateRenderOverride(key, v === "__default__" ? "" : v)}
                  >
                    <SelectTrigger className="h-7 w-48 shrink-0 text-xs text-left">
                      <SelectValue>
                        {renderOverride ? strategyDisplayName(renderOverride) : <Trans>Default</Trans>}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="__default__">
                        <span className="text-muted-foreground">{<Trans>Default</Trans>}</span>
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
                    onClick={() => toggleDisabled(key)}
                    className={`shrink-0 p-0.5 rounded transition-colors ${disabled ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive"}`}
                    title={disabled ? t`Re-enable type` : t`Disable type`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={newTypeKey}
                onChange={(e) => setNewTypeKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSectionType()}
                className="h-7 text-xs w-40 shrink-0"
                placeholder={t`new_type_key`}
              />
              <Input
                value={newTypeDesc}
                onChange={(e) => setNewTypeDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSectionType()}
                className="h-7 text-xs flex-1 min-w-0"
                placeholder={t`Description...`}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={addSectionType}
                disabled={!newTypeKey.trim() || newTypeKey.trim().toLowerCase().replace(/\s+/g, "_") in sectionTypes}
              >
                {<Trans>Add</Trans>}
              </Button>
            </div>
          </div>
          </div>
        </div>
      )}

      {tab === "sectioning-prompt" && (
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            <PromptViewer
              promptName="page_sectioning"
              bookLabel={bookLabel}
              title={t`Page Sectioning Prompt`}
              description={t`The prompt template used to split each page into logical sections. This is a Liquid template processed with page context.`}
              draft={sectioningPromptDraft}
              model={sectioning.model}
              onModelChange={sectioning.onModelChange}
              maxRetries={sectioning.maxRetries}
              onMaxRetriesChange={sectioning.onMaxRetriesChange}
              onContentChange={(content, modelId) => setSectioningPromptDraft(toPromptDraft(content, modelId))}
            />
          </div>
        </div>
      )}

      {tab === "refinement-prompt" && (
        <div className="flex flex-col h-full">
          <div className="shrink-0 p-4 pb-0 space-y-4">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {<Trans>Max Refinements</Trans>}
              </h3>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={maxRefinements}
                  onChange={(e) => {
                    setMaxRefinements(e.target.value)
                    markDirty("max_refinements")
                  }}
                  placeholder="0"
                  className="h-9 w-24 text-sm"
                />
                <Label className="text-xs text-muted-foreground">
                  {<Trans>0 = single pass, higher values allow iterative LLM refinement</Trans>}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {<Trans>Number of refinement iterations performed after the initial sectioning pass.</Trans>}
              </p>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <PromptViewer
              promptName="page_sectioning_refinement"
              bookLabel={bookLabel}
              title={t`Page Sectioning Refinement Prompt`}
              description={t`The prompt used by the reviewer pass to inspect and correct a candidate sectioning tree. Shares the model and retry settings of the sectioning prompt.`}
              draft={refinementPromptDraft}
              hideModel
              onContentChange={(content, modelId) => setRefinementPromptDraft(toPromptDraft(content, modelId))}
            />
          </div>
        </div>
      )}

      {tab === "container-types" && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {<Trans>Container Types</Trans>}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {<Trans>Container node types the LLM may produce in the content tree during sectioning.</Trans>}
          </p>
          <div className="rounded-md border divide-y">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground shrink-0 w-40">{<Trans>Type</Trans>}</span>
              <span className="text-xs font-medium text-muted-foreground flex-1 min-w-0">{<Trans>Description</Trans>}</span>
              <span className="shrink-0 w-5" />
            </div>
            {orderedStructureEntries.map(([key, description]) => (
              <div key={key} className="flex items-center gap-2 px-3 py-1.5 group">
                <span className="text-xs shrink-0 w-40 truncate font-mono font-medium">{key}</span>
                <Input
                  value={description}
                  onChange={(e) => updateStructureDescription(key, e.target.value)}
                  className="h-7 text-xs flex-1 min-w-0"
                  placeholder={t`Description...`}
                />
                <button
                  type="button"
                  onClick={() => removeStructureType(key)}
                  className="shrink-0 p-0.5 rounded transition-colors text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive"
                  title={t`Remove type`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={newStructKey}
                onChange={(e) => setNewStructKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addStructureType()}
                className="h-7 text-xs w-36 shrink-0"
                placeholder={t`new_type_key`}
              />
              <Input
                value={newStructDesc}
                onChange={(e) => setNewStructDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addStructureType()}
                className="h-7 text-xs flex-1 min-w-0"
                placeholder={t`Description...`}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={addStructureType}
                disabled={!newStructKey.trim() || newStructKey.trim().toLowerCase().replace(/\s+/g, "_") in structureTypes}
              >
                {<Trans>Add</Trans>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === "text-types" && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {<Trans>Text Types</Trans>}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {<Trans>Text roles the LLM may assign to text in the content tree. Pruned roles are classified but excluded from rendering.</Trans>}
          </p>
          <div className="rounded-md border divide-y">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50">
              <span className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium text-muted-foreground shrink-0 w-40">{<Trans>Type</Trans>}</span>
              <span className="text-xs font-medium text-muted-foreground flex-1 min-w-0">{<Trans>Description</Trans>}</span>
              <span className="shrink-0 w-5" />
            </div>
            {orderedRoleEntries.map(([key, description]) => {
              const pruned = prunedRoleTypes.has(key)
              return (
              <div key={key} className={`flex items-center gap-2 px-3 py-1.5 group ${pruned ? "bg-muted/30" : ""}`}>
                <PruneToggle pruned={pruned} onToggle={() => togglePrunedRole(key)} />
                <span className={`text-xs shrink-0 w-40 truncate font-mono ${pruned ? "text-muted-foreground line-through" : "font-medium"}`}>{key}</span>
                <Input
                  value={description}
                  onChange={(e) => updateRoleDescription(key, e.target.value)}
                  className="h-7 text-xs flex-1 min-w-0"
                  placeholder={t`Description...`}
                />
                <button
                  type="button"
                  onClick={() => removeRoleType(key)}
                  className="shrink-0 p-0.5 rounded transition-colors text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive"
                  title={t`Remove type`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              )
            })}
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={newRoleKey}
                onChange={(e) => setNewRoleKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRoleType()}
                className="h-7 text-xs w-36 shrink-0"
                placeholder={t`new_type_key`}
              />
              <Input
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRoleType()}
                className="h-7 text-xs flex-1 min-w-0"
                placeholder={t`Description...`}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={addRoleType}
                disabled={!newRoleKey.trim() || newRoleKey.trim().toLowerCase().replace(/\s+/g, "_") in roleTypes}
              >
                {<Trans>Add</Trans>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
