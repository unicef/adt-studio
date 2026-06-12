import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { Play } from "lucide-react"
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
import { PromptViewer } from "@/components/pipeline/components/PromptViewer"
import { useBookRun } from "@/hooks/use-book-run"
import { useStepConfig } from "@/hooks/use-step-config"
import { normalizeLocale } from "@/lib/languages"
import { useLingui } from "@lingui/react/macro"

export function ExtractSettings({ bookLabel, headerTarget, tab = "general" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const navigate = useNavigate()
  const [showRerunDialog, setShowRerunDialog] = useState(false)

  // Form state
  const [startPage, setStartPage] = useState("")
  const [endPage, setEndPage] = useState("")
  const [spreadMode, setSpreadMode] = useState(false)
  const [vectorTextGrouping, setVectorTextGrouping] = useState(true)
  const [editingLanguage, setEditingLanguage] = useState("")
  const [minSide, setMinSide] = useState("")
  const [maxSide, setMaxSide] = useState("")
  const [minStddev, setMinStddev] = useState("")
  const [meaningfulness, setMeaningfulness] = useState(true)
  const [cropping, setCropping] = useState(false)
  const [segmentation, setSegmentation] = useState(false)
  const [segmentationMinSide, setSegmentationMinSide] = useState("")
  const [metadataPromptDraft, setMetadataPromptDraft] = useState<string | null>(null)
  const [meaningfulnessPromptDraft, setMeaningfulnessPromptDraft] = useState<string | null>(null)
  const [croppingPromptDraft, setCroppingPromptDraft] = useState<string | null>(null)
  const [segmentationPromptDraft, setSegmentationPromptDraft] = useState<string | null>(null)

  // Track which field groups the user has actually touched
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const metadata = useStepConfig(merged, "metadata", markDirty)
  const imageMeaningfulness = useStepConfig(merged, "image_meaningfulness", markDirty)
  const imageCropping = useStepConfig(merged, "image_cropping", markDirty)
  const imageSegmentation = useStepConfig(merged, "image_segmentation", markDirty)

  // Load config into form state
  useEffect(() => {
    if (!bookConfigData) return
    const c = bookConfigData.config
    setSpreadMode(c.spread_mode === true)
    setVectorTextGrouping(c.vector_text_grouping !== false)
    if (c.editing_language) setEditingLanguage(normalizeLocale(String(c.editing_language)))
    if (c.start_page != null) setStartPage(String(c.start_page))
    if (c.end_page != null) setEndPage(String(c.end_page))
  }, [bookConfigData])

  // Load image filters, and segmentation min_side from active (merged) config
  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    if (m.image_filters && typeof m.image_filters === "object") {
      const filters = m.image_filters as Record<string, unknown>
      if (filters.min_side != null) setMinSide(String(filters.min_side))
      if (filters.max_side != null) setMaxSide(String(filters.max_side))
      if (filters.min_stddev != null) setMinStddev(String(filters.min_stddev))
      if (filters.meaningfulness != null) setMeaningfulness(filters.meaningfulness !== false)
      if (filters.cropping != null) setCropping(filters.cropping === true)
      if (filters.segmentation != null) setSegmentation(filters.segmentation === true)
    }
    if (m.image_segmentation && typeof m.image_segmentation === "object") {
      const is = m.image_segmentation as Record<string, unknown>
      if (is.min_side != null) setSegmentationMinSide(String(is.min_side))
    }
  }, [activeConfigData])

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
    if (shouldWrite("vector_text_grouping")) {
      overrides.vector_text_grouping = vectorTextGrouping
    }
    if (shouldWrite("start_page")) {
      overrides.start_page = startPage.trim() ? Number(startPage) : undefined
    }
    if (shouldWrite("end_page")) {
      overrides.end_page = endPage.trim() ? Number(endPage) : undefined
    }
    if (shouldWrite("editing_language") || editingLanguage.trim()) {
      const normalized = normalizeLocale(editingLanguage.trim())
      overrides.editing_language = normalized || undefined
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
      overrides.metadata = { ...existing, ...metadata.configOverrides }
    }
    if (shouldWrite("image_meaningfulness")) {
      const existing = (bookConfigData?.config?.image_meaningfulness ?? {}) as Record<string, unknown>
      overrides.image_meaningfulness = { ...existing, ...imageMeaningfulness.configOverrides }
    }
    if (shouldWrite("image_cropping")) {
      const existing = (bookConfigData?.config?.image_cropping ?? {}) as Record<string, unknown>
      overrides.image_cropping = { ...existing, ...imageCropping.configOverrides }
    }
    if (shouldWrite("image_segmentation")) {
      const existing = (bookConfigData?.config?.image_segmentation ?? {}) as Record<string, unknown>
      overrides.image_segmentation = {
        ...existing,
        ...imageSegmentation.configOverrides,
        min_side: segmentationMinSide.trim() ? Number(segmentationMinSide) : undefined,
      }
    }

    return overrides
  }

  const confirmSaveAndRerun = async () => {
    // Save any edited prompts first
    const promptSaves: Promise<unknown>[] = []
    if (metadataPromptDraft != null) promptSaves.push(api.updatePrompt("metadata_extraction", metadataPromptDraft, bookLabel))
    if (meaningfulnessPromptDraft != null) promptSaves.push(api.updatePrompt("image_meaningfulness", meaningfulnessPromptDraft, bookLabel))
    if (croppingPromptDraft != null) promptSaves.push(api.updatePrompt("image_cropping", croppingPromptDraft, bookLabel))
    if (segmentationPromptDraft != null) promptSaves.push(api.updatePrompt("image_segmentation", segmentationPromptDraft, bookLabel))
    if (promptSaves.length > 0) await Promise.all(promptSaves)

    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: async () => {
          setDirty({})
          setMetadataPromptDraft(null)
          setMeaningfulnessPromptDraft(null)
          setCroppingPromptDraft(null)
          setSegmentationPromptDraft(null)
          setShowRerunDialog(false)
          queueRun({ fromStage: "extract", toStage: "extract", apiKey })
          navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: "extract" } })
        },
      }
    )
  }

  return (
    <div className={tab === "metadata-prompt" || tab === "meaningfulness-prompt" || tab === "cropping-prompt" || tab === "segmentation-prompt" ? "h-full max-w-4xl" : "p-4 space-y-6"}>
      {tab === "general" && (
        <>
          {/* Page Range */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t`Page Range`}
            </h3>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={startPage}
                onChange={(e) => { setStartPage(e.target.value); markDirty("start_page") }}
                placeholder={t`First`}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">{t`to`}</span>
              <Input
                type="number"
                min={1}
                value={endPage}
                onChange={(e) => { setEndPage(e.target.value); markDirty("end_page") }}
                placeholder={t`Last`}
                className="w-24"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t`Leave empty to process all pages.`}
            </p>
          </div>

          {/* Spread Mode */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t`Spread Mode`}
            </h3>
            <div className="flex items-center gap-2">
              <Switch
                id="spread-mode"
                checked={spreadMode}
                onCheckedChange={(v) => { setSpreadMode(v); markDirty("spread_mode") }}
              />
              <Label htmlFor="spread-mode" className="text-sm font-normal">
                {t`Merge facing pages as spreads`}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t`Enable for scanned books where two pages appear on a single PDF page.`}
            </p>
          </div>

          {/* Vector + Text Grouping */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t`Vector Extraction`}
            </h3>
            <div className="flex items-center gap-2">
              <Switch
                id="vector-text-grouping"
                checked={vectorTextGrouping}
                onCheckedChange={(v) => { setVectorTextGrouping(v); markDirty("vector_text_grouping") }}
              />
              <Label htmlFor="vector-text-grouping" className="text-sm font-normal">
                {t`Include text overlays in vector groups`}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t`When enabled, text labels near vector images (e.g. chart dimensions, speech bubbles) are grouped together and extracted as raster crops. Disable to extract only the core vector shapes without text.`}
            </p>
          </div>

          {/* Editing Language */}
          <div className="max-w-sm">
            <LanguagePicker
              selected={editingLanguage}
              onSelect={(v) => { setEditingLanguage(v); markDirty("editing_language") }}
              label={t`Editing Language`}
              hint={t`Leave empty to use the book language.`}
            />
          </div>

          {/* Image Filters */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t`Image Filters`}
            </h3>
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t`Min side (px)`}</Label>
                <Input
                  type="number"
                  min={0}
                  value={minSide}
                  onChange={(e) => { setMinSide(e.target.value); markDirty("image_filters") }}
                  placeholder={t`None`}
                  className="w-28"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t`Max side (px)`}</Label>
                <Input
                  type="number"
                  min={0}
                  value={maxSide}
                  onChange={(e) => { setMaxSide(e.target.value); markDirty("image_filters") }}
                  placeholder={t`None`}
                  className="w-28"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t`Images with shortest side below min or longest side above max are pruned.`}
            </p>
            <div className="space-y-1 mt-3">
              <Label className="text-xs">{t`Min complexity`}</Label>
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
              {t`Higher values filter out simple or blank images.`}
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
                {t`LLM meaningfulness filter`}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t`Use an LLM to filter out decorative or non-educational images.`}
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
                {t`LLM image cropping`}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t`Use an LLM to crop away stray text, artifacts, and excessive whitespace from image edges.`}
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
                {t`LLM image segmentation`}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t`Use an LLM to detect and split composited images (e.g., multiple photos in a single image layer) into individual segments. Requires GPT-5.2+.`}
            </p>
          </div>
        </>
      )}

      {tab === "metadata-prompt" && (
        <PromptViewer
          promptName="metadata_extraction"
          bookLabel={bookLabel}
          title={t`Metadata Extraction Prompt`}
          description={t`The prompt template used to extract book metadata (title, author, etc.) from the first few pages. This is a Liquid template processed with page context.`}
          model={metadata.model}
          onModelChange={metadata.onModelChange}
          maxRetries={metadata.maxRetries}
          onMaxRetriesChange={metadata.onMaxRetriesChange}
          onContentChange={setMetadataPromptDraft}
          enabled={tab === "metadata-prompt"}
        />
      )}

      {tab === "meaningfulness-prompt" && (
        <PromptViewer
          promptName="image_meaningfulness"
          bookLabel={bookLabel}
          title={t`Image Meaningfulness Prompt`}
          description={t`LLM-based filter to determine if extracted images are meaningful.`}
          model={imageMeaningfulness.model}
          onModelChange={imageMeaningfulness.onModelChange}
          maxRetries={imageMeaningfulness.maxRetries}
          onMaxRetriesChange={imageMeaningfulness.onMaxRetriesChange}
          onContentChange={setMeaningfulnessPromptDraft}
          enabled={tab === "meaningfulness-prompt"}
        />
      )}

      {tab === "cropping-prompt" && (
        <PromptViewer
          promptName="image_cropping"
          bookLabel={bookLabel}
          title={t`Image Cropping Prompt`}
          description={t`LLM-based cropping to remove stray text, artifacts, and excessive whitespace from extracted images.`}
          model={imageCropping.model}
          onModelChange={imageCropping.onModelChange}
          maxRetries={imageCropping.maxRetries}
          onMaxRetriesChange={imageCropping.onMaxRetriesChange}
          onContentChange={setCroppingPromptDraft}
          enabled={tab === "cropping-prompt"}
        />
      )}

      {tab === "segmentation-prompt" && (
        <div className="flex flex-col h-full">
          <div className="shrink-0 px-4 pt-4 pb-3 space-y-1.5 border-b">
            <Label className="text-xs">{t`Min image dimension (px)`}</Label>
            <Input
              type="number"
              min={0}
              value={segmentationMinSide}
              onChange={(e) => { setSegmentationMinSide(e.target.value); markDirty("image_segmentation") }}
              placeholder={t`None`}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              {t`Skip segmentation for images whose shortest side is below this threshold.`}
            </p>
          </div>
          <div className="flex-1 min-h-0">
            <PromptViewer
              promptName="image_segmentation"
              bookLabel={bookLabel}
              title={t`Image Segmentation Prompt`}
              description={t`LLM-based segmentation to detect and split composited images into individual segments. Requires GPT-5.2+ for accurate bounding box coordinates.`}
              model={imageSegmentation.model}
              onModelChange={imageSegmentation.onModelChange}
              maxRetries={imageSegmentation.maxRetries}
              onMaxRetriesChange={imageSegmentation.onMaxRetriesChange}
              onContentChange={setSegmentationPromptDraft}
              enabled={tab === "segmentation-prompt"}
            />
          </div>
        </div>
      )}

      {headerTarget && createPortal(
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs bg-black/15 text-white hover:bg-black/25"
          onClick={() => setShowRerunDialog(true)}
          disabled={updateConfig.isPending || !hasApiKey}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {t`Save & Rerun`}
        </Button>,
        headerTarget
      )}

      <Dialog open={showRerunDialog} onOpenChange={setShowRerunDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Save & Rerun Extraction`}</DialogTitle>
            <DialogDescription>
              {t`This will save your settings and re-run the extraction pipeline. Any manual edits to extracted text will be overwritten for affected pages.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRerunDialog(false)}>
              {t`Cancel`}
            </Button>
            <Button onClick={confirmSaveAndRerun} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? t`Saving...` : t`Confirm Rerun`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
