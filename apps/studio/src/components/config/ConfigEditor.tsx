import { useState, useEffect } from "react"
import { Play, Save, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { ALL_TEXT_TYPES, ALL_SECTION_TYPES } from "@/lib/config-constants"

interface ConfigEditorProps {
  label: string
  onRun: (options: { startPage?: number; endPage?: number }) => void
  isRunning: boolean
  isPipelineStarting: boolean
  hasApiKey: boolean
  pageCount: number
}

export function ConfigEditor({
  label,
  onRun,
  isRunning,
  isPipelineStarting,
  hasApiKey,
  pageCount,
}: ConfigEditorProps) {
  const { data: bookConfigData } = useBookConfig(label)
  const { data: activeConfigData } = useActiveConfig(label)
  const updateConfig = useUpdateBookConfig()

  // Run tab state
  const [startPage, setStartPage] = useState("")
  const [endPage, setEndPage] = useState("")
  const [spreadMode, setSpreadMode] = useState(false)

  // Config tab state
  const [configConcurrency, setConfigConcurrency] = useState("")
  const [rateLimit, setRateLimit] = useState("")
  const [minSide, setMinSide] = useState("")
  const [maxSide, setMaxSide] = useState("")
  const [prunedTextTypes, setPrunedTextTypes] = useState<Set<string>>(new Set())
  const [prunedSectionTypes, setPrunedSectionTypes] = useState<Set<string>>(new Set())
  const [metadataModel, setMetadataModel] = useState("")
  const [textClassModel, setTextClassModel] = useState("")
  const [pageSectionModel, setPageSectionModel] = useState("")
  const [editingLanguage, setEditingLanguage] = useState("")
  const [defaultRenderStrategy, setDefaultRenderStrategy] = useState("")

  const [showRebuildDialog, setShowRebuildDialog] = useState(false)
  const [configDirty, setConfigDirty] = useState(false)

  // Load book-level overrides into form
  useEffect(() => {
    if (!bookConfigData) return
    const c = bookConfigData.config
    setSpreadMode(c.spread_mode === true)
    if (c.concurrency != null) setConfigConcurrency(String(c.concurrency))
    if (c.rate_limit && typeof c.rate_limit === "object" && "requests_per_minute" in c.rate_limit) {
      setRateLimit(String((c.rate_limit as Record<string, unknown>).requests_per_minute))
    }
    if (c.image_filters && typeof c.image_filters === "object") {
      const f = c.image_filters as Record<string, unknown>
      if (f.min_side != null) setMinSide(String(f.min_side))
      if (f.max_side != null) setMaxSide(String(f.max_side))
    }
    if (Array.isArray(c.pruned_text_types)) {
      setPrunedTextTypes(new Set(c.pruned_text_types as string[]))
    }
    if (Array.isArray(c.pruned_section_types)) {
      setPrunedSectionTypes(new Set(c.pruned_section_types as string[]))
    }
    if (c.metadata && typeof c.metadata === "object" && "model" in c.metadata) {
      setMetadataModel(String((c.metadata as Record<string, unknown>).model ?? ""))
    }
    if (c.text_classification && typeof c.text_classification === "object" && "model" in c.text_classification) {
      setTextClassModel(String((c.text_classification as Record<string, unknown>).model ?? ""))
    }
    if (c.page_sectioning && typeof c.page_sectioning === "object" && "model" in c.page_sectioning) {
      setPageSectionModel(String((c.page_sectioning as Record<string, unknown>).model ?? ""))
    }
    if (c.editing_language) setEditingLanguage(String(c.editing_language))
    if (c.default_render_strategy) setDefaultRenderStrategy(String(c.default_render_strategy))
  }, [bookConfigData])

  const getPlaceholder = (path: string): string => {
    if (!activeConfigData) return ""
    const merged = activeConfigData.merged
    const parts = path.split(".")
    let val: unknown = merged
    for (const p of parts) {
      if (val && typeof val === "object") val = (val as Record<string, unknown>)[p]
      else return ""
    }
    return val != null ? String(val) : ""
  }

  const getDefaultPrunedTextTypes = (): Set<string> => {
    if (!activeConfigData) return new Set()
    const arr = (activeConfigData.merged as Record<string, unknown>).pruned_text_types
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set()
  }

  const getDefaultPrunedSectionTypes = (): Set<string> => {
    if (!activeConfigData) return new Set()
    const arr = (activeConfigData.merged as Record<string, unknown>).pruned_section_types
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set()
  }

  // Determine which pruned types to show (book override if dirty, else defaults from active config)
  const effectivePrunedTextTypes = configDirty ? prunedTextTypes : (
    bookConfigData?.config.pruned_text_types ? prunedTextTypes : getDefaultPrunedTextTypes()
  )
  const effectivePrunedSectionTypes = configDirty ? prunedSectionTypes : (
    bookConfigData?.config.pruned_section_types ? prunedSectionTypes : getDefaultPrunedSectionTypes()
  )

  const togglePrunedText = (t: string) => {
    setConfigDirty(true)
    setPrunedTextTypes((prev) => {
      // If not dirty yet, start from active config defaults
      const base = configDirty ? prev : (
        bookConfigData?.config.pruned_text_types ? prev : getDefaultPrunedTextTypes()
      )
      const next = new Set(base)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const togglePrunedSection = (t: string) => {
    setConfigDirty(true)
    setPrunedSectionTypes((prev) => {
      const base = configDirty ? prev : (
        bookConfigData?.config.pruned_section_types ? prev : getDefaultPrunedSectionTypes()
      )
      const next = new Set(base)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const buildOverrides = (): Record<string, unknown> => {
    const overrides: Record<string, unknown> = {}

    if (configConcurrency.trim()) overrides.concurrency = Number(configConcurrency)
    if (rateLimit.trim()) overrides.rate_limit = { requests_per_minute: Number(rateLimit) }

    const imageFilters: Record<string, unknown> = {}
    if (minSide.trim()) imageFilters.min_side = Number(minSide)
    if (maxSide.trim()) imageFilters.max_side = Number(maxSide)
    if (Object.keys(imageFilters).length > 0) overrides.image_filters = imageFilters

    if (configDirty || bookConfigData?.config.pruned_text_types) {
      overrides.pruned_text_types = Array.from(effectivePrunedTextTypes)
    }
    if (configDirty || bookConfigData?.config.pruned_section_types) {
      overrides.pruned_section_types = Array.from(effectivePrunedSectionTypes)
    }

    if (metadataModel.trim()) overrides.metadata = { model: metadataModel.trim() }
    if (textClassModel.trim()) overrides.text_classification = { model: textClassModel.trim() }
    if (pageSectionModel.trim()) overrides.page_sectioning = { model: pageSectionModel.trim() }

    if (editingLanguage.trim()) overrides.editing_language = editingLanguage.trim()
    if (defaultRenderStrategy.trim()) overrides.default_render_strategy = defaultRenderStrategy.trim()

    if (spreadMode) overrides.spread_mode = true

    // Preserve existing content settings from book config
    if (bookConfigData?.config) {
      const bc = bookConfigData.config
      if (!editingLanguage.trim() && bc.editing_language) overrides.editing_language = bc.editing_language
      if (bc.output_languages) overrides.output_languages = bc.output_languages
      if (bc.book_format) overrides.book_format = bc.book_format
      if (bc.layout_type) overrides.layout_type = bc.layout_type
      if (bc.render_strategies) overrides.render_strategies = bc.render_strategies
      if (bc.section_render_strategies) overrides.section_render_strategies = bc.section_render_strategies
      if (!defaultRenderStrategy.trim() && bc.default_render_strategy) overrides.default_render_strategy = bc.default_render_strategy
      if (bc.translation) overrides.translation = bc.translation
    }

    return overrides
  }

  const handleSave = () => {
    const overrides = buildOverrides()
    updateConfig.mutate({ label, config: overrides })
    setConfigDirty(false)
  }

  const handleSaveAndRebuild = () => {
    setShowRebuildDialog(true)
  }

  const confirmRebuild = () => {
    const overrides = buildOverrides()
    updateConfig.mutate(
      { label, config: overrides },
      {
        onSuccess: () => {
          setConfigDirty(false)
          setShowRebuildDialog(false)
          const options: { startPage?: number; endPage?: number } = {}
          if (startPage) options.startPage = Number(startPage)
          if (endPage) options.endPage = Number(endPage)
          onRun(options)
        },
      }
    )
  }

  const handleRun = () => {
    const options: { startPage?: number; endPage?: number } = {}
    if (startPage) options.startPage = Number(startPage)
    if (endPage) options.endPage = Number(endPage)
    if (!bookConfigData) {
      onRun(options)
      return
    }

    const persistedSpreadMode = bookConfigData.config.spread_mode === true
    if (persistedSpreadMode === spreadMode) {
      onRun(options)
      return
    }

    const overrides = buildOverrides()
    updateConfig.mutate(
      { label, config: overrides },
      {
        onSuccess: () => {
          setConfigDirty(false)
          onRun(options)
        },
      }
    )
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4" />
            Pipeline Configuration
          </CardTitle>
          <CardDescription>
            Configure and run the pipeline, or edit book-level overrides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="run">
            <TabsList className="mb-4">
              <TabsTrigger value="run">Run</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
            </TabsList>

            {/* Run Tab */}
            <TabsContent value="run">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Page Range</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={startPage}
                        onChange={(e) => setStartPage(e.target.value)}
                        placeholder="First"
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        min={1}
                        value={endPage}
                        onChange={(e) => setEndPage(e.target.value)}
                        placeholder="Last"
                        className="w-20"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave empty for all pages
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Spread Mode</Label>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="spread-mode"
                        checked={spreadMode}
                        onCheckedChange={(checked) => { setSpreadMode(checked); setConfigDirty(true) }}
                      />
                      <Label htmlFor="spread-mode" className="text-xs text-muted-foreground font-normal">
                        Merge facing pages as spreads
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <Button
                    onClick={handleRun}
                    disabled={isPipelineStarting || isRunning || updateConfig.isPending || !hasApiKey}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {isPipelineStarting ? "Starting..." : pageCount > 0 ? "Re-run Pipeline" : "Run Pipeline"}
                  </Button>
                  {!hasApiKey && (
                    <span className="text-xs text-muted-foreground">
                      Enter your API key above to run.
                    </span>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Config Tab */}
            <TabsContent value="config">
              <div className="space-y-5">
                {/* Processing */}
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Processing</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Concurrency</Label>
                      <Input
                        type="number"
                        min={1}
                        value={configConcurrency}
                        onChange={(e) => { setConfigConcurrency(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("concurrency") || "32"}
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rate Limit (req/min)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={rateLimit}
                        onChange={(e) => { setRateLimit(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("rate_limit.requests_per_minute") || "60"}
                        className="w-24"
                      />
                    </div>
                  </div>
                </div>

                {/* Image Filters */}
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Image Filters</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Min Side (px)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={minSide}
                        onChange={(e) => { setMinSide(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("image_filters.min_side") || "100"}
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max Side (px)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={maxSide}
                        onChange={(e) => { setMaxSide(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("image_filters.max_side") || "5000"}
                        className="w-24"
                      />
                    </div>
                  </div>
                </div>

                {/* Pruned Text Types */}
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pruned Text Types</h4>
                  <p className="mb-2 text-xs text-muted-foreground">Pruned types are excluded from rendering.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_TEXT_TYPES.map((t) => {
                      const pruned = effectivePrunedTextTypes.has(t)
                      return (
                        <Badge
                          key={t}
                          variant={pruned ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => togglePrunedText(t)}
                        >
                          {t.replace(/_/g, " ")}
                        </Badge>
                      )
                    })}
                  </div>
                </div>

                {/* Pruned Section Types */}
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pruned Section Types</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_SECTION_TYPES.map((t) => {
                      const pruned = effectivePrunedSectionTypes.has(t)
                      return (
                        <Badge
                          key={t}
                          variant={pruned ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => togglePrunedSection(t)}
                        >
                          {t.replace(/_/g, " ")}
                        </Badge>
                      )
                    })}
                  </div>
                </div>

                {/* Model Overrides */}
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Model Overrides</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Metadata</Label>
                      <Input
                        value={metadataModel}
                        onChange={(e) => { setMetadataModel(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("metadata.model") || "openai:gpt-5.2"}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Text Classification</Label>
                      <Input
                        value={textClassModel}
                        onChange={(e) => { setTextClassModel(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("text_classification.model") || "openai:gpt-5.2"}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Page Sectioning</Label>
                      <Input
                        value={pageSectionModel}
                        onChange={(e) => { setPageSectionModel(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("page_sectioning.model") || "openai:gpt-5.2"}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Rendering */}
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Rendering</h4>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Default Render Strategy</Label>
                      <Input
                        value={defaultRenderStrategy}
                        onChange={(e) => { setDefaultRenderStrategy(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("default_render_strategy") || "two_column"}
                        className="text-xs w-48"
                      />
                    </div>
                    {activeConfigData?.merged && !!(activeConfigData.merged as Record<string, unknown>).render_strategies && typeof (activeConfigData.merged as Record<string, unknown>).render_strategies === "object" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Available Strategies</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries((activeConfigData.merged as Record<string, unknown>).render_strategies as Record<string, unknown>).map(([name, strategy]) => {
                            const renderType = strategy && typeof strategy === "object" && "type" in strategy ? String((strategy as Record<string, unknown>).type) : "unknown"
                            return (
                              <Badge key={name} variant="outline" className="text-xs">
                                {name} <span className="ml-1 text-muted-foreground">[{renderType}]</span>
                              </Badge>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Language & Content */}
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Language & Content</h4>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Editing Language</Label>
                      <Input
                        value={editingLanguage}
                        onChange={(e) => { setEditingLanguage(e.target.value); setConfigDirty(true) }}
                        placeholder={getPlaceholder("editing_language") || "English"}
                        className="text-xs w-48"
                      />
                    </div>
                    {bookConfigData?.config && (
                      !!bookConfigData.config.output_languages ||
                      !!bookConfigData.config.book_format
                    ) && (
                      <div className="text-xs space-y-1 text-muted-foreground">
                        {Array.isArray(bookConfigData.config.output_languages) && (
                          <p>Output Languages: <span className="text-foreground">{(bookConfigData.config.output_languages as string[]).join(", ")}</span></p>
                        )}
                        {Array.isArray(bookConfigData.config.book_format) && (
                          <p>Book Format: <span className="text-foreground">{(bookConfigData.config.book_format as string[]).join(", ")}</span></p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Save buttons */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    disabled={updateConfig.isPending}
                  >
                    <Save className="mr-2 h-3 w-3" />
                    {updateConfig.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveAndRebuild}
                    disabled={updateConfig.isPending || !hasApiKey}
                  >
                    <Play className="mr-2 h-3 w-3" />
                    Save & Rebuild
                  </Button>
                  {!hasApiKey && (
                    <span className="text-xs text-muted-foreground">
                      Set API key in Run tab to rebuild.
                    </span>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Rebuild confirmation dialog */}
      <Dialog open={showRebuildDialog} onOpenChange={setShowRebuildDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save & Rebuild</DialogTitle>
            <DialogDescription>
              This will save config changes and re-run the full pipeline. Existing
              pipeline data will be overwritten for affected pages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRebuildDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRebuild} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? "Saving..." : "Confirm Rebuild"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
