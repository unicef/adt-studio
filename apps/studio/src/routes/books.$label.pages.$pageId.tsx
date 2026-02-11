import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { ArrowLeft, ArrowRight, FileText, Image, Layers, Loader2, AlertCircle, ImageOff } from "lucide-react"
import DOMPurify from "dompurify"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePage, usePageImage, usePages } from "@/hooks/use-pages"
import { EditToolbar } from "@/components/page-edit/EditToolbar"
import { TextGroupEditor } from "@/components/page-edit/TextGroupEditor"
import { ImagePruningEditor } from "@/components/page-edit/ImagePruningEditor"
import { useSaveTextClassification, useSaveImageClassification, useReRenderPage } from "@/hooks/use-page-mutations"
import { useApiKey } from "@/hooks/use-api-key"
import type { PageDetail } from "@/api/client"

export const Route = createFileRoute("/books/$label/pages/$pageId")({
  component: PageDetailPage,
})

/**
 * Renders HTML content and gracefully handles broken images by replacing
 * them with a styled placeholder showing the alt text.
 */
function RenderedHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const sanitizedHtml = useMemo(
    () => DOMPurify.sanitize(html),
    [html]
  )

  useEffect(() => {
    if (!ref.current) return

    // Strip inline font-family from all elements so the app font is used consistently
    const allEls = ref.current.querySelectorAll("*")
    for (const el of allEls) {
      if (el instanceof HTMLElement && el.style.fontFamily) {
        el.style.fontFamily = ""
      }
    }

    const imgs = ref.current.querySelectorAll("img")
    for (const img of imgs) {
      img.onerror = () => {
        const placeholder = document.createElement("div")
        placeholder.style.cssText =
          "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;" +
          "min-height:120px;padding:16px;border-radius:8px;" +
          "border:2px dashed #d1d5db;background:#f9fafb;"

        // Icon (SVG inline since we can't use React components here)
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        icon.setAttribute("width", "32")
        icon.setAttribute("height", "32")
        icon.setAttribute("viewBox", "0 0 24 24")
        icon.setAttribute("fill", "none")
        icon.setAttribute("stroke", "#9ca3af")
        icon.setAttribute("stroke-width", "1.5")
        icon.innerHTML =
          '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
          '<circle cx="9" cy="9" r="2"/>' +
          '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>' +
          '<line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" stroke-width="2"/>'
        placeholder.appendChild(icon)

        // Alt text label
        if (img.alt) {
          const label = document.createElement("span")
          label.style.cssText = "font-size:13px;font-weight:500;color:#6b7280;text-align:center;"
          label.textContent = img.alt
          placeholder.appendChild(label)
        }

        // Error detail with src path
        const detail = document.createElement("span")
        detail.style.cssText = "font-size:11px;color:#9ca3af;text-align:center;word-break:break-all;max-width:100%;"
        const src = img.getAttribute("src") || ""
        detail.textContent = src ? `Image not found: ${src}` : "Image source unavailable"
        placeholder.appendChild(detail)

        img.replaceWith(placeholder)
      }
    }
  }, [sanitizedHtml])

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}

function PageDetailPage() {
  const { label, pageId } = Route.useParams()
  const navigate = useNavigate()
  const { data: page, isLoading, error } = usePage(label, pageId)
  const { data: imageData } = usePageImage(label, pageId)
  const { data: allPages } = usePages(label)

  const { apiKey, hasApiKey } = useApiKey()
  const [isEditing, setIsEditing] = useState(false)
  const [editedGroups, setEditedGroups] = useState<PageDetail["textClassification"]>(null)
  const [editedImages, setEditedImages] = useState<PageDetail["imageClassification"]>(null)

  const saveText = useSaveTextClassification(label, pageId)
  const saveImages = useSaveImageClassification(label, pageId)
  const reRender = useReRenderPage(label, pageId)

  const handleEdit = useCallback(() => {
    if (page?.textClassification) {
      setEditedGroups(structuredClone(page.textClassification))
    }
    if (page?.imageClassification) {
      setEditedImages(structuredClone(page.imageClassification))
    }
    setIsEditing(true)
  }, [page])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setEditedGroups(null)
    setEditedImages(null)
  }, [])

  const handleSave = useCallback(async () => {
    const promises: Promise<unknown>[] = []

    if (editedGroups && JSON.stringify(editedGroups) !== JSON.stringify(page?.textClassification)) {
      promises.push(saveText.mutateAsync(editedGroups))
    }
    if (editedImages && JSON.stringify(editedImages) !== JSON.stringify(page?.imageClassification)) {
      promises.push(saveImages.mutateAsync(editedImages))
    }

    await Promise.all(promises)
    setIsEditing(false)
    setEditedGroups(null)
    setEditedImages(null)
  }, [editedGroups, editedImages, page, saveText, saveImages])

  const handleReRender = useCallback(() => {
    if (hasApiKey) {
      reRender.mutate(apiKey)
    }
  }, [apiKey, hasApiKey, reRender])

  const hasChanges =
    (editedGroups && JSON.stringify(editedGroups) !== JSON.stringify(page?.textClassification)) ||
    (editedImages && JSON.stringify(editedImages) !== JSON.stringify(page?.imageClassification)) ||
    false

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading page...</div>
  }

  if (error) {
    return (
      <div className="p-4 text-destructive">
        Failed to load page: {error.message}
      </div>
    )
  }

  if (!page) return null

  // Find prev/next pages for navigation
  const currentIndex = allPages?.findIndex((p) => p.pageId === pageId) ?? -1
  const prevPage = currentIndex > 0 ? allPages?.[currentIndex - 1] : null
  const nextPage =
    allPages && currentIndex < allPages.length - 1
      ? allPages[currentIndex + 1]
      : null

  // Combine all section HTMLs into a single preview
  const combinedHtml = page.rendering?.sections
    .map((s) => s.html)
    .join("\n")

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Compact header: breadcrumb + nav + toolbar in one row */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-1.5">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
            ADT Studio
          </Link>
          <span className="text-muted-foreground/50 text-xs">/</span>
          <Link to="/books/$label" params={{ label }} className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
            {label}
          </Link>
          <span className="text-muted-foreground/50 text-xs">/</span>
          <span className="text-sm font-semibold">Page {page.pageNumber}</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!prevPage}
              onClick={() =>
                prevPage &&
                navigate({
                  to: "/books/$label/pages/$pageId",
                  params: { label, pageId: prevPage.pageId },
                })
              }
            >
              <ArrowLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!nextPage}
              onClick={() =>
                nextPage &&
                navigate({
                  to: "/books/$label/pages/$pageId",
                  params: { label, pageId: nextPage.pageId },
                })
              }
            >
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <EditToolbar
          isEditing={isEditing}
          hasChanges={hasChanges}
          isSaving={saveText.isPending || saveImages.isPending}
          isReRendering={reRender.isPending}
          hasApiKey={hasApiKey}
          hasRenderingData={!!page.textClassification}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
          onReRender={handleReRender}
        />
      </div>

      {/* Error banner */}
      {reRender.error && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Re-render failed: {reRender.error.message}</span>
          <Button variant="ghost" size="sm" onClick={() => reRender.reset()}>
            Dismiss
          </Button>
        </div>
      )}

      {/* 3-column layout: Pipeline Inputs | Rendered Output | Original Page */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.2fr_1.2fr] gap-0 divide-x">
        {/* Left: Pipeline inputs (text classification + image classification) */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4 py-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Pipeline Inputs</span>
            {isEditing && <Badge variant="secondary" className="text-xs">Editing</Badge>}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {/* Text classification */}
            {isEditing && editedGroups ? (
              <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-3 w-3" />
                  Text Groups ({editedGroups.groups.length})
                </h3>
                <TextGroupEditor
                  groups={editedGroups.groups}
                  onChange={(groups) => setEditedGroups({ ...editedGroups, groups })}
                />
              </div>
            ) : page.textClassification ? (
              <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-3 w-3" />
                  Text Groups ({page.textClassification.groups.length})
                </h3>
                <div className="space-y-3">
                  {page.textClassification.groups.map((group) => (
                    <div key={group.groupId} className="rounded border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{group.groupType}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {group.groupId}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {group.texts.map((t, i) => (
                          <div
                            key={i}
                            className={`text-sm ${t.isPruned ? "text-muted-foreground line-through" : ""}`}
                          >
                            <span className="mr-1 text-xs text-muted-foreground">
                              [{t.textType}]
                            </span>
                            {t.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mb-6 text-sm text-muted-foreground">
                No text classification data. Run the pipeline first.
              </p>
            )}

            {/* Image classification */}
            {isEditing && editedImages ? (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Image className="h-3 w-3" />
                  Images ({editedImages.images.length})
                </h3>
                <ImagePruningEditor
                  images={editedImages.images}
                  onChange={(images) => setEditedImages({ ...editedImages, images })}
                />
              </div>
            ) : page.imageClassification && page.imageClassification.images.length > 0 ? (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Image className="h-3 w-3" />
                  Images ({page.imageClassification.images.length})
                </h3>
                <div className="space-y-2">
                  {page.imageClassification.images.map((img) => (
                    <div key={img.imageId} className={`flex items-center justify-between rounded border p-2 ${img.isPruned ? "opacity-60" : ""}`}>
                      <span className={`text-sm ${img.isPruned ? "line-through" : ""}`}>{img.imageId}</span>
                      {img.reason && <span className="text-xs text-muted-foreground">{img.reason}</span>}
                      {img.isPruned && <Badge variant="outline" className="text-xs">Pruned</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Center: Pipeline Output — tabs for Preview vs By Section */}
        <Tabs defaultValue="preview" className="flex flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4 py-1.5">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Pipeline Output</span>
            {reRender.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            <TabsList className="ml-auto h-7">
              <TabsTrigger value="preview" className="px-2.5 py-1 text-xs">Preview</TabsTrigger>
              <TabsTrigger value="sections" className="px-2.5 py-1 text-xs">
                By Section{page.rendering ? ` (${page.rendering.sections.length})` : ""}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="preview" className="mt-0 flex-1 overflow-auto p-4">
            {reRender.isPending ? (
              <div className="flex aspect-[3/4] items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Re-rendering page...
                </div>
              </div>
            ) : combinedHtml ? (
              <RenderedHtml
                html={combinedHtml}
                className="prose prose-sm max-w-none rounded border bg-white p-4 font-sans"
              />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <ImageOff className="h-6 w-6" />
                  Not yet rendered. Run the pipeline first.
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sections" className="mt-0 flex-1 overflow-auto p-4">
            {page.rendering && page.sectioning ? (
              <div className="space-y-4">
                {page.rendering.sections.map((section, i) => {
                  const sectionMeta = page.sectioning?.sections[i]
                  return (
                    <div key={i} className="rounded border">
                      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Section {i + 1}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {section.sectionType}
                        </Badge>
                        {sectionMeta && (
                          <div className="flex gap-1">
                            <span
                              className="inline-block h-3 w-3 rounded border"
                              style={{ backgroundColor: sectionMeta.backgroundColor }}
                              title={`bg: ${sectionMeta.backgroundColor}`}
                            />
                            <span
                              className="inline-block h-3 w-3 rounded border"
                              style={{ backgroundColor: sectionMeta.textColor }}
                              title={`text: ${sectionMeta.textColor}`}
                            />
                          </div>
                        )}
                        {sectionMeta?.isPruned && (
                          <Badge variant="secondary" className="text-xs">Pruned</Badge>
                        )}
                      </div>
                      <div className="p-3">
                        <RenderedHtml
                          html={section.html}
                          className="prose prose-sm max-w-none rounded bg-white p-2 font-sans"
                        />
                        {section.reasoning && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {section.reasoning}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <ImageOff className="h-6 w-6" />
                  No sections. Run the pipeline first.
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Right: Original page image */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4 py-2">
            <Image className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Original Page</span>
          </div>
          <div className="flex flex-1 items-start justify-center overflow-auto p-4">
            {imageData ? (
              <img
                src={`data:image/png;base64,${imageData.imageBase64}`}
                alt={`Page ${page.pageNumber}`}
                className="max-h-full w-auto rounded border object-contain"
              />
            ) : (
              <div className="flex aspect-[3/4] w-full items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <ImageOff className="h-6 w-6" />
                  No image available
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
