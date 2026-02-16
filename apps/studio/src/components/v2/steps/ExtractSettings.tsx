import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
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
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function ExtractSettings({ bookLabel, headerTarget, tab = "general" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { apiKey, hasApiKey } = useApiKey()
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

  // Track which field groups the user has actually touched
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  // Load config into form state
  useEffect(() => {
    if (!bookConfigData) return
    const c = bookConfigData.config
    setSpreadMode(c.spread_mode === true)
    if (c.editing_language) setEditingLanguage(String(c.editing_language))
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
      overrides.editing_language = editingLanguage.trim() || undefined
    }
    if (shouldWrite("text_types")) {
      overrides.text_types = textTypes
    }
    if (shouldWrite("pruned_text_types")) {
      overrides.pruned_text_types = Array.from(prunedTextTypes)
    }
    if (shouldWrite("image_filters")) {
      const filters: Record<string, number> = {}
      if (minSide) filters.min_side = Number(minSide)
      if (maxSide) filters.max_side = Number(maxSide)
      overrides.image_filters = Object.keys(filters).length > 0 ? filters : undefined
    }

    return overrides
  }

  const confirmSaveAndRerun = () => {
    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: () => {
          setDirty({})
          setShowRerunDialog(false)
          const options: { startPage?: number; endPage?: number } = {}
          if (startPage) options.startPage = Number(startPage)
          if (endPage) options.endPage = Number(endPage)
          api.runPipeline(bookLabel, apiKey, options)
        },
      }
    )
  }

  // Prompt fetching (only when tab is active)
  const { data: promptData, isLoading: promptLoading } = useQuery({
    queryKey: ["prompts", "text_classification"],
    queryFn: () => api.getPrompt("text_classification"),
    enabled: tab === "prompt",
  })

  return (
    <div className="p-4 max-w-2xl space-y-6">
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
          <div className="max-w-xs">
            <LanguagePicker
              selected={editingLanguage}
              onSelect={(v) => { setEditingLanguage(v); markDirty("editing_language") }}
              label="Editing Language"
              hint="The primary language of the book content."
            />
          </div>

          {/* Image Pruning */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Image Size Filters
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
          </div>
        </>
      )}

      {tab === "text-types" && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            Types used during text classification. Pruned types are excluded from rendering.
          </p>
          <div className="rounded-md border divide-y">
            {Object.entries(textTypes).map(([key, description]) => {
              const pruned = prunedTextTypes.has(key)
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 px-3 py-1.5 group"
                >
                  <input
                    type="checkbox"
                    checked={pruned}
                    onChange={() => togglePruned(key)}
                    title={pruned ? "Include in rendering" : "Prune from rendering"}
                    className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 accent-primary"
                  />
                  <span className={`text-xs shrink-0 w-40 truncate ${pruned ? "text-muted-foreground line-through" : "font-medium"}`}>
                    {key.replace(/_/g, " ")}
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

      {tab === "prompt" && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            The prompt template used for text classification. This is a Liquid template processed with page context.
          </p>
          {promptLoading ? (
            <div className="text-sm text-muted-foreground">Loading prompt...</div>
          ) : promptData?.content ? (
            <pre className="text-xs font-mono bg-muted/50 border rounded-md p-4 overflow-auto max-h-[calc(100vh-200px)] whitespace-pre-wrap">
              {promptData.content}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">
              Prompt template not found.
            </div>
          )}
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
