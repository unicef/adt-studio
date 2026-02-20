import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Play, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LanguagePicker } from "@/components/LanguagePicker"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/PromptViewer"
import { PruneToggle } from "@/components/pipeline/PruneToggle"
import { useStepRun } from "@/hooks/use-step-run"
import { normalizeLocale } from "@/lib/languages"

export function ExtractSettings({ bookLabel, headerTarget, tab = "general" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { apiKey, hasApiKey } = useApiKey()
  const { startRun, setSseEnabled } = useStepRun()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showRerunDialog, setShowRerunDialog] = useState(false)

  // Form state
  const [startPage, setStartPage] = useState("")
  const [endPage, setEndPage] = useState("")
  const [spreadMode, setSpreadMode] = useState(false)
  const [editingLanguage, setEditingLanguage] = useState("")
  const [textTypes, setTextTypes] = useState<Record<string, string>>({})
  const [prunedTextTypes, setPrunedTextTypes] = useState<Set<string>>(new Set())
  const [minSide, setMinSide] = useState("")
  const [maxSide, setMaxSide] = useState("")
  const [minStddev, setMinStddev] = useState("")
  const [meaningfulness, setMeaningfulness] = useState(true)
  const [cropping, setCropping] = useState(false)
  const [segmentation, setSegmentation] = useState(false)
  const [metadataModel, setMetadataModel] = useState("")
  const [extractionModel, setExtractionModel] = useState("")
  const [meaningfulnessModel, setMeaningfulnessModel] = useState("")
  const [croppingModel, setCroppingModel] = useState("")
  const [segmentationModel, setSegmentationModel] = useState("")
  const [bookSummaryModel, setBookSummaryModel] = useState("")
  const [metadataPromptDraft, setMetadataPromptDraft] = useState<string | null>(null)
  const [extractionPromptDraft, setExtractionPromptDraft] = useState<string | null>(null)
  const [meaningfulnessPromptDraft, setMeaningfulnessPromptDraft] = useState<string | null>(null)
  const [croppingPromptDraft, setCroppingPromptDraft] = useState<string | null>(null)
  const [segmentationPromptDraft, setSegmentationPromptDraft] = useState<string | null>(null)
  const [bookSummaryPromptDraft, setBookSummaryPromptDraft] = useState<string | null>(null)

  // Track which field groups the user has actually touched
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  // Load config into form state
  useEffect(() => {
    if (!bookConfigData) return
    const c = bookConfigData.config
    setSpreadMode(c.spread_mode === true)
    if (c.editing_language) setEditingLanguage(normalizeLocale(String(c.editing_language)))
  }, [bookConfigData])

  // Load text types, pruned types, and image filters from active (merged) config
  useEffect(() => {
    if (!activeConfigData) return
    const merged = activeConfigData.merged as Record<string, unknown>
    if (merged.text_types && typeof merged.text_types === "object") {
      setTextTypes(merged.text_types as Record<string, string>)
    }
    if (Array.isArray(merged.pruned_text_types)) {
      setPrunedTextTypes(new Set(merged.pruned_text_types as string[]))
    }
    if (merged.image_filters && typeof merged.image_filters === "object") {
      const filters = merged.image_filters as Record<string, unknown>
      if (filters.min_side != null) setMinSide(String(filters.min_side))
      if (filters.max_side != null) setMaxSide(String(filters.max_side))
      if (filters.min_stddev != null) setMinStddev(String(filters.min_stddev))
      if (filters.meaningfulness != null) setMeaningfulness(filters.meaningfulness !== false)
      if (filters.cropping != null) setCropping(filters.cropping === true)
      if (filters.segmentation != null) setSegmentation(filters.segmentation === true)
    }
    if (merged.metadata && typeof merged.metadata === "object") {
      const md = merged.metadata as Record<string, unknown>
      if (md.model) setMetadataModel(String(md.model))
    }
    if (merged.text_classification && typeof merged.text_classification === "object") {
      const tc = merged.text_classification as Record<string, unknown>
      if (tc.model) setExtractionModel(String(tc.model))
    }
    if (merged.image_meaningfulness && typeof merged.image_meaningfulness === "object") {
      const im = merged.image_meaningfulness as Record<string, unknown>
      if (im.model) setMeaningfulnessModel(String(im.model))
    }
    if (merged.image_cropping && typeof merged.image_cropping === "object") {
      const ic = merged.image_cropping as Record<string, unknown>
      if (ic.model) setCroppingModel(String(ic.model))
    }
    if (merged.image_segmentation && typeof merged.image_segmentation === "object") {
      const is = merged.image_segmentation as Record<string, unknown>
      if (is.model) setSegmentationModel(String(is.model))
    }
    if (merged.book_summary && typeof merged.book_summary === "object") {
      const bs = merged.book_summary as Record<string, unknown>
      if (bs.model) setBookSummaryModel(String(bs.model))
    }
  }, [activeConfigData])

  const [newTypeKey, setNewTypeKey] = useState("")
  const [newTypeDesc, setNewTypeDesc] = useState("")

  const togglePruned = (key: string) => {
    markDirty("pruned_text_types")
    setPrunedTextTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const updateDescription = (key: string, description: string) => {
    markDirty("text_types")
    setTextTypes((prev) => ({ ...prev, [key]: description }))
  }

  const removeTextType = (key: string) => {
    markDirty("text_types")
    markDirty("pruned_text_types")
    setTextTypes((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPrunedTextTypes((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const addTextType = () => {
    const key = newTypeKey.trim().toLowerCase().replace(/\s+/g, "_")
    if (!key || key in textTypes) return
    markDirty("text_types")
    setTextTypes((prev) => ({ ...prev, [key]: newTypeDesc.trim() }))
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
    if (shouldWrite("spread_mode")) {
      overrides.spread_mode = spreadMode
    }
    if (shouldWrite("editing_language") || editingLanguage.trim()) {
      const normalized = normalizeLocale(editingLanguage.trim())
      overrides.editing_language = normalized || undefined
    }
    if (shouldWrite("text_types")) {
      overrides.text_types = textTypes
    }
    if (shouldWrite("pruned_text_types")) {
      overrides.pruned_text_types = Array.from(prunedTextTypes)
    }
    if (shouldWrite("image_filters")) {
      const filters: Record<string, unknown> = {}
      if (minSide) filters.min_side = Number(minSide)
      if (maxSide) filters.max_side = Number(maxSide)
      if (minStddev) filters.min_stddev = Number(minStddev)
      filters.meaningfulness = meaningfulness
      filters.cropping = cropping
      filters.segmentation = segmentation
      overrides.image_filters = filters
    }
    if (shouldWrite("metadata")) {
      const existing = (bookConfigData?.config?.metadata ?? {}) as Record<string, unknown>
      overrides.metadata = { ...existing, model: metadataModel.trim() || undefined }
    }
    if (shouldWrite("text_classification")) {
      const existing = (bookConfigData?.config?.text_classification ?? {}) as Record<string, unknown>
      overrides.text_classification = { ...existing, model: extractionModel.trim() || undefined }
    }
    if (shouldWrite("image_meaningfulness")) {
      const existing = (bookConfigData?.config?.image_meaningfulness ?? {}) as Record<string, unknown>
      overrides.image_meaningfulness = { ...existing, model: meaningfulnessModel.trim() || undefined }
    }
    if (shouldWrite("image_cropping")) {
      const existing = (bookConfigData?.config?.image_cropping ?? {}) as Record<string, unknown>
      overrides.image_cropping = { ...existing, model: croppingModel.trim() || undefined }
    }
    if (shouldWrite("image_segmentation")) {
      const existing = (bookConfigData?.config?.image_segmentation ?? {}) as Record<string, unknown>
      overrides.image_segmentation = { ...existing, model: segmentationModel.trim() || undefined }
    }
    if (shouldWrite("book_summary")) {
      const existing = (bookConfigData?.config?.book_summary ?? {}) as Record<string, unknown>
      overrides.book_summary = { ...existing, model: bookSummaryModel.trim() || undefined }
    }

    return overrides
  }

  const confirmSaveAndRerun = async () => {
    // Save any edited prompts first
    const promptSaves: Promise<unknown>[] = []
    if (metadataPromptDraft != null) promptSaves.push(api.updatePrompt("metadata_extraction", metadataPromptDraft, bookLabel))
    if (extractionPromptDraft != null) promptSaves.push(api.updatePrompt("text_classification", extractionPromptDraft, bookLabel))
    if (meaningfulnessPromptDraft != null) promptSaves.push(api.updatePrompt("image_meaningfulness", meaningfulnessPromptDraft, bookLabel))
    if (croppingPromptDraft != null) promptSaves.push(api.updatePrompt("image_cropping", croppingPromptDraft, bookLabel))
    if (segmentationPromptDraft != null) promptSaves.push(api.updatePrompt("image_segmentation", segmentationPromptDraft, bookLabel))
    if (bookSummaryPromptDraft != null) promptSaves.push(api.updatePrompt("book_summary", bookSummaryPromptDraft, bookLabel))
    if (promptSaves.length > 0) await Promise.all(promptSaves)

    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: async () => {
          setDirty({})
          setMetadataPromptDraft(null)
          setExtractionPromptDraft(null)
          setMeaningfulnessPromptDraft(null)
          setCroppingPromptDraft(null)
          setSegmentationPromptDraft(null)
          setBookSummaryPromptDraft(null)
          setShowRerunDialog(false)
          // Start step-scoped extract run — blocks until data is cleared on backend
          startRun("extract", "extract")
          setSseEnabled(true)
          await api.runSteps(bookLabel, apiKey, { fromStep: "extract", toStep: "extract" })
          // Remove cached data so the extract page shows empty state (not stale pages)
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "pages"] })
          queryClient.removeQueries({ queryKey: ["books", bookLabel] })
          // Navigate back to the main extract view after data is cleared
          navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: "extract" } })
        },
      }
    )
  }

  return (
    <div className={tab === "metadata-prompt" || tab === "prompt" || tab === "meaningfulness-prompt" || tab === "cropping-prompt" || tab === "segmentation-prompt" || tab === "book-summary-prompt" ? "h-full max-w-4xl" : "p-4 space-y-6"}>
      {tab === "general" && (
        <>
          {/* Page Range */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Page Range
            </h3>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={startPage}
                onChange={(e) => setStartPage(e.target.value)}
                placeholder="First"
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="number"
                min={1}
                value={endPage}
                onChange={(e) => setEndPage(e.target.value)}
                placeholder="Last"
                className="w-24"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Leave empty to process all pages.
            </p>
          </div>

          {/* Spread Mode */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Spread Mode
            </h3>
            <div className="flex items-center gap-2">
              <Switch
                id="spread-mode"
                checked={spreadMode}
                onCheckedChange={(v) => { setSpreadMode(v); markDirty("spread_mode") }}
              />
              <Label htmlFor="spread-mode" className="text-sm font-normal">
                Merge facing pages as spreads
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Enable for scanned books where two pages appear on a single PDF page.
            </p>
          </div>

          {/* Editing Language */}
          <div className="max-w-sm">
            <LanguagePicker
              selected={editingLanguage}
              onSelect={(v) => { setEditingLanguage(v); markDirty("editing_language") }}
              label="Editing Language"
              hint="Leave empty to use the book language."
            />
          </div>

          {/* Image Filters */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Image Filters
            </h3>
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Min side (px)</Label>
                <Input
                  type="number"
                  min={0}
                  value={minSide}
                  onChange={(e) => { setMinSide(e.target.value); markDirty("image_filters") }}
                  placeholder="None"
                  className="w-28"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max side (px)</Label>
                <Input
                  type="number"
                  min={0}
                  value={maxSide}
                  onChange={(e) => { setMaxSide(e.target.value); markDirty("image_filters") }}
                  placeholder="None"
                  className="w-28"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Images with shortest side below min or longest side above max are pruned.
            </p>
            <div className="space-y-1 mt-3">
              <Label className="text-xs">Min complexity</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={minStddev}
                onChange={(e) => { setMinStddev(e.target.value); markDirty("image_filters") }}
                placeholder="2"
                className="w-28"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Higher values filter out simple or blank images.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <Switch
                id="meaningfulness-filter"
                checked={meaningfulness}
                onCheckedChange={(v) => {
                  setMeaningfulness(v)
                  markDirty("image_filters")
                }}
              />
              <Label htmlFor="meaningfulness-filter" className="text-sm font-normal">
                LLM meaningfulness filter
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Use an LLM to filter out decorative or non-educational images.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <Switch
                id="cropping-filter"
                checked={cropping}
                onCheckedChange={(v) => {
                  setCropping(v)
                  markDirty("image_filters")
                }}
              />
              <Label htmlFor="cropping-filter" className="text-sm font-normal">
                LLM image cropping
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Use an LLM to crop away stray text, artifacts, and excessive whitespace from image edges.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <Switch
                id="segmentation-filter"
                checked={segmentation}
                onCheckedChange={(v) => {
                  setSegmentation(v)
                  markDirty("image_filters")
                }}
              />
              <Label htmlFor="segmentation-filter" className="text-sm font-normal">
                LLM image segmentation
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Use an LLM to detect and split composited images (e.g., multiple photos in a single image layer) into individual segments. Requires GPT-5.2+.
            </p>
          </div>
        </>
      )}

      {tab === "text-types" && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            Types used during text classification. Pruned types are excluded from rendering.
          </p>
          <div className="rounded-md border divide-y">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50">
              <span className="shrink-0 w-5" />
              <span className="text-xs font-medium text-muted-foreground shrink-0 w-40">Type</span>
              <span className="text-xs font-medium text-muted-foreground flex-1 min-w-0">Description</span>
              <span className="shrink-0 w-5" />
            </div>
            {Object.entries(textTypes).map(([key, description]) => {
              const pruned = prunedTextTypes.has(key)
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
                  <button
                    type="button"
                    onClick={() => removeTextType(key)}
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
                onKeyDown={(e) => e.key === "Enter" && addTextType()}
                className="h-7 text-xs w-40 shrink-0"
                placeholder="new_type_key"
              />
              <Input
                value={newTypeDesc}
                onChange={(e) => setNewTypeDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTextType()}
                className="h-7 text-xs flex-1 min-w-0"
                placeholder="Description..."
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={addTextType}
                disabled={!newTypeKey.trim() || newTypeKey.trim().toLowerCase().replace(/\s+/g, "_") in textTypes}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === "metadata-prompt" && (
        <PromptViewer
          promptName="metadata_extraction"
          bookLabel={bookLabel}
          title="Metadata Extraction Prompt"
          description="The prompt template used to extract book metadata (title, author, etc.) from the first few pages. This is a Liquid template processed with page context."
          model={metadataModel}
          onModelChange={(v) => { setMetadataModel(v); markDirty("metadata") }}
          onContentChange={setMetadataPromptDraft}
          enabled={tab === "metadata-prompt"}
        />
      )}

      {tab === "prompt" && (
        <PromptViewer
          promptName="text_classification"
          bookLabel={bookLabel}
          title="Text Classification Prompt"
          description="The prompt template used for text classification. This is a Liquid template processed with page context."
          model={extractionModel}
          onModelChange={(v) => { setExtractionModel(v); markDirty("text_classification") }}
          onContentChange={setExtractionPromptDraft}
          enabled={tab === "prompt"}
        />
      )}

      {tab === "meaningfulness-prompt" && (
        <PromptViewer
          promptName="image_meaningfulness"
          bookLabel={bookLabel}
          title="Image Meaningfulness Prompt"
          description="LLM-based filter to determine if extracted images are meaningful."
          model={meaningfulnessModel}
          onModelChange={(v) => { setMeaningfulnessModel(v); markDirty("image_meaningfulness") }}
          onContentChange={setMeaningfulnessPromptDraft}
          enabled={tab === "meaningfulness-prompt"}
        />
      )}

      {tab === "cropping-prompt" && (
        <PromptViewer
          promptName="image_cropping"
          bookLabel={bookLabel}
          title="Image Cropping Prompt"
          description="LLM-based cropping to remove stray text, artifacts, and excessive whitespace from extracted images."
          model={croppingModel}
          onModelChange={(v) => { setCroppingModel(v); markDirty("image_cropping") }}
          onContentChange={setCroppingPromptDraft}
          enabled={tab === "cropping-prompt"}
        />
      )}

      {tab === "segmentation-prompt" && (
        <PromptViewer
          promptName="image_segmentation"
          bookLabel={bookLabel}
          title="Image Segmentation Prompt"
          description="LLM-based segmentation to detect and split composited images into individual segments. Requires GPT-5.2+ for accurate bounding box coordinates."
          model={segmentationModel}
          onModelChange={(v) => { setSegmentationModel(v); markDirty("image_segmentation") }}
          onContentChange={setSegmentationPromptDraft}
          enabled={tab === "segmentation-prompt"}
        />
      )}

      {tab === "book-summary-prompt" && (
        <PromptViewer
          promptName="book_summary"
          bookLabel={bookLabel}
          title="Book Summary Prompt"
          description="The prompt template used to generate a short book summary at the end of extract. The summary is generated in the configured editing language."
          model={bookSummaryModel}
          onModelChange={(v) => { setBookSummaryModel(v); markDirty("book_summary") }}
          onContentChange={setBookSummaryPromptDraft}
          enabled={tab === "book-summary-prompt"}
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
            <DialogTitle>Save &amp; Rerun Extraction</DialogTitle>
            <DialogDescription>
              This will save your settings and re-run the extraction pipeline.
              Any manual edits to extracted text will be overwritten for affected pages.
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
