import { useState, useEffect, useRef } from "react"
import { Check, Eye, EyeOff, Layers, Loader2, ChevronDown, RefreshCw } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { PageDetail, VersionEntry } from "@/api/client"
import { useReRenderPage } from "@/hooks/use-page-mutations"
import { useApiKey } from "@/hooks/use-api-key"
import { BookPreviewFrame } from "@/components/storyboard/BookPreviewFrame"

// -- VersionPicker (same as ExtractPageDetail) --

function VersionPicker({
  currentVersion,
  saving,
  dirty,
  bookLabel,
  node,
  itemId,
  onPreview,
  onSave,
  onDiscard,
}: {
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
  node: string
  itemId: string
  onPreview: (data: unknown) => void
  onSave?: () => void
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
    const res = await api.getVersionHistory(bookLabel, node, itemId, true)
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
    return <Loader2 className="h-3 w-3 animate-spin ml-auto" />
  }

  if (currentVersion == null) return null

  if (dirty) {
    return (
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDiscard}
          className="text-[10px] font-medium rounded px-2 py-0.5 bg-muted hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
        >
          Discard
        </button>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-colors"
          >
            <Check className="h-3 w-3" />
            Save
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal bg-muted hover:bg-muted/80 rounded px-1.5 py-0.5 transition-colors"
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

// -- ImageCard --

function ImageCard({ imageId, bookLabel, isPruned, reason }: { imageId: string; bookLabel: string; isPruned?: boolean; reason?: string }) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  return (
    <div
      className={`relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[80px] ${isPruned ? "opacity-40" : ""}`}
      title={isPruned ? `Pruned: ${reason}` : undefined}
    >
      <img
        src={`/api/books/${bookLabel}/images/${imageId}`}
        alt={imageId}
        className={`max-w-full h-auto block my-auto ${isPruned ? "grayscale" : ""}`}
        onLoad={(e) => {
          const img = e.target as HTMLImageElement
          setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = "none"
        }}
      />
      <div className="px-2 py-1 flex items-center justify-between border-t bg-muted/30 w-full mt-auto">
        <span className="text-[10px] text-muted-foreground truncate">{imageId}</span>
        {dimensions && (
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
            {dimensions.w}&times;{dimensions.h}
          </span>
        )}
      </div>
    </div>
  )
}

// -- Types --

type SectioningData = NonNullable<PageDetail["sectioning"]>
type RenderingData = NonNullable<PageDetail["rendering"]>

// -- Main component --

export function StoryboardSectionDetail({
  bookLabel,
  pageId,
  sectionIndex,
  page,
}: {
  bookLabel: string
  pageId: string
  sectionIndex: number
  page: PageDetail
}) {
  const queryClient = useQueryClient()
  const reRender = useReRenderPage(bookLabel, pageId)
  const { apiKey, hasApiKey } = useApiKey()

  const [saving, setSaving] = useState(false)
  const [pendingSectioning, setPendingSectioning] = useState<SectioningData | null>(null)
  const [pendingRendering, setPendingRendering] = useState<RenderingData | null>(null)

  // Clear pending state when page changes
  useEffect(() => {
    setPendingSectioning(null)
    setPendingRendering(null)
  }, [pageId])

  // Effective data
  const sectioningData = pendingSectioning ?? page.sectioning
  const dirty = pendingSectioning != null

  // Current section data
  const section = sectioningData?.sections[sectionIndex]
  const renderingData = pendingRendering ?? page.rendering
  const renderedSection = renderingData?.sections[sectionIndex]
  const renderingDirty = pendingRendering != null

  if (!section) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Section not found.
      </div>
    )
  }

  // Parts are inline in the section data
  const parts = section.parts

  // Save / discard sectioning
  const saveSectioning = async () => {
    if (!pendingSectioning) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateSectioning(bookLabel, pageId, pendingSectioning)
    setPendingSectioning(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
    await minDelay
    setSaving(false)

    // Automatically re-render with the updated sectioning
    if (hasApiKey) {
      reRender.mutate(apiKey)
    }
  }

  const discardSectioning = () => {
    setPendingSectioning(null)
  }

  // Save / discard rendering
  const saveRendering = async () => {
    if (!pendingRendering) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateRendering(bookLabel, pageId, pendingRendering)
    setPendingRendering(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
    await minDelay
    setSaving(false)
  }

  // Toggle isPruned on a part within the current section
  const togglePartPruned = (partIndex: number) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        return {
          ...s,
          parts: s.parts.map((p, pi) => {
            if (pi !== partIndex) return p
            return { ...p, isPruned: !p.isPruned }
          }),
        }
      }),
    }
    setPendingSectioning(updated)
  }

  // Check if this section has any text groups or images
  const hasTextParts = parts.some((p) => p.type === "text_group")
  const hasImageParts = parts.some((p) => p.type === "image")

  return (
    <div className="h-full overflow-auto">
      {/* Rendered HTML preview — full width */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wider">Rendered</span>
          <button
            type="button"
            disabled={!hasApiKey || reRender.isPending}
            onClick={() => hasApiKey && reRender.mutate(apiKey)}
            className="p-1 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            title={!hasApiKey ? "Set API key first" : "Re-render from current sectioning"}
          >
            <RefreshCw className={`h-3 w-3 ${reRender.isPending ? "animate-spin" : ""}`} />
          </button>
          <VersionPicker
            currentVersion={page.versions.rendering}
            saving={saving || reRender.isPending}
            dirty={renderingDirty}
            bookLabel={bookLabel}
            node="web-rendering"
            itemId={pageId}
            onPreview={(data) => setPendingRendering(data as RenderingData)}
            onSave={saveRendering}
            onDiscard={() => setPendingRendering(null)}
          />
        </div>
        {renderedSection?.html ? (
          <BookPreviewFrame html={renderedSection.html} className="w-full rounded border" />
        ) : (
          <div className="p-4 text-sm text-muted-foreground border rounded">
            No rendered content for this section.
          </div>
        )}
      </div>

      {/* Section data — constrained width */}
      <div className="max-w-3xl mx-auto py-4 px-4 space-y-6">

      {/* Section metadata */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wider">{section.sectionType}</span>
        {!section.isPruned && (
          <>
            <span
              className="w-4 h-4 rounded border"
              style={{ backgroundColor: section.backgroundColor }}
              title={`Background: ${section.backgroundColor}`}
            />
            <span
              className="w-4 h-4 rounded border"
              style={{ backgroundColor: section.textColor }}
              title={`Text color: ${section.textColor}`}
            />
          </>
        )}
        {section.isPruned && (
          <span className="text-destructive text-[10px] font-medium">(pruned)</span>
        )}
        <VersionPicker
          currentVersion={page.versions.sectioning}
          saving={saving}
          dirty={dirty}
          bookLabel={bookLabel}
          node="page-sectioning"
          itemId={pageId}
          onPreview={(data) => setPendingSectioning(data as SectioningData)}
          onSave={saveSectioning}
          onDiscard={discardSectioning}
        />
      </div>

      {/* Section input: text groups */}
      {hasTextParts && (
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            <Layers className="h-3 w-3" />
            Text Groups
          </h3>
          <div className="space-y-3">
            {parts.map((p, partIndex) => {
                if (p.type !== "text_group") return null
                return (
                  <div key={p.groupId} className={`rounded border overflow-hidden transition-opacity ${p.isPruned ? "opacity-40" : ""}`}>
                    <div className="px-3 py-1.5 bg-muted/50 border-b flex items-center gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p.groupType}</span>
                      <button
                        type="button"
                        onClick={() => togglePartPruned(partIndex)}
                        className="ml-auto p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
                        title={p.isPruned ? "Include in render" : "Exclude from render"}
                      >
                        {p.isPruned ? (
                          <EyeOff className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                    <div className="divide-y">
                      {p.texts.map((t, i) => (
                        <div key={i} className={`px-3 py-1.5 flex items-start gap-2 text-sm ${t.isPruned ? "opacity-40" : ""}`}>
                          <span
                            className="shrink-0 text-xs font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 text-center"
                          >
                            {t.textType}
                          </span>
                          <span className="leading-relaxed flex-1 min-w-0">
                            {t.text}
                          </span>
                          {t.isPruned && (
                            <EyeOff className="shrink-0 self-center h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Section input: images */}
      {hasImageParts && (
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Images
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {parts.map((p, partIndex) => {
                if (p.type !== "image") return null
                return (
                  <div key={p.imageId} className="group relative">
                    <ImageCard
                      imageId={p.imageId}
                      bookLabel={bookLabel}
                      isPruned={p.isPruned}
                      reason={p.reason}
                    />
                    <button
                      type="button"
                      onClick={() => togglePartPruned(partIndex)}
                      className="absolute top-1 right-1 p-1 rounded bg-background/80 hover:bg-accent transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                      title={p.isPruned ? "Include in render" : "Exclude from render"}
                    >
                      {p.isPruned ? (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
