import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState, useCallback, useEffect } from "react"
import { ArrowLeft, ArrowRight, FileText, Image, Layers, Loader2, AlertCircle, CheckCircle2, ImageOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePage, usePageImage, usePages } from "@/hooks/use-pages"
import { EditToolbar } from "@/components/page-edit/EditToolbar"
import { TextGroupEditor } from "@/components/page-edit/TextGroupEditor"
import { ImagePruningEditor } from "@/components/page-edit/ImagePruningEditor"
import { RenderedHtml } from "@/components/storyboard/RenderedHtml"
import { useSaveTextClassification, useSaveImageClassification, useSaveSectioning, useReRenderPage } from "@/hooks/use-page-mutations"
import { SectionEditor } from "@/components/page-edit/SectionEditor"
import { useApiKey } from "@/hooks/use-api-key"
import { useGuideDismissed } from "@/hooks/use-guide-dismissed"
import { ActivityAnswerPanel } from "@/components/storyboard/ActivityAnswerPanel"
import { isActivitySection, formatSectionType } from "@/lib/activity-utils"
import type { PageDetail } from "@/api/client"

export const Route = createFileRoute("/books/$label/pages/$pageId")({
  component: PageDetailPage,
})

function PageDetailPage() {
  const { label, pageId } = Route.useParams()
  const navigate = useNavigate()
  const { data: page, isLoading, error } = usePage(label, pageId)
  const { data: imageData } = usePageImage(label, pageId)
  const { data: allPages } = usePages(label)

  const { apiKey, hasApiKey } = useApiKey()
  const [pageGuideDismissed, dismissPageGuide] = useGuideDismissed("page-edit")
  const [isEditing, setIsEditing] = useState(false)
  const [editedGroups, setEditedGroups] = useState<PageDetail["textClassification"]>(null)
  const [editedImages, setEditedImages] = useState<PageDetail["imageClassification"]>(null)
  const [editedSectioning, setEditedSectioning] = useState<PageDetail["sectioning"]>(null)

  const saveText = useSaveTextClassification(label, pageId)
  const saveImages = useSaveImageClassification(label, pageId)
  const saveSectioning = useSaveSectioning(label, pageId)
  const reRender = useReRenderPage(label, pageId)

  const handleEdit = useCallback(() => {
    if (page?.textClassification) {
      setEditedGroups(structuredClone(page.textClassification))
    }
    if (page?.imageClassification) {
      setEditedImages(structuredClone(page.imageClassification))
    }
    if (page?.sectioning) {
      setEditedSectioning(structuredClone(page.sectioning))
    }
    setIsEditing(true)
  }, [page])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setEditedGroups(null)
    setEditedImages(null)
    setEditedSectioning(null)
  }, [])

  const handleSave = useCallback(async () => {
    const promises: Promise<unknown>[] = []

    if (editedGroups && JSON.stringify(editedGroups) !== JSON.stringify(page?.textClassification)) {
      promises.push(saveText.mutateAsync(editedGroups))
    }
    if (editedImages && JSON.stringify(editedImages) !== JSON.stringify(page?.imageClassification)) {
      promises.push(saveImages.mutateAsync(editedImages))
    }
    if (editedSectioning && JSON.stringify(editedSectioning) !== JSON.stringify(page?.sectioning)) {
      promises.push(saveSectioning.mutateAsync(editedSectioning))
    }

    await Promise.all(promises)
    setIsEditing(false)
    setEditedGroups(null)
    setEditedImages(null)
    setEditedSectioning(null)
  }, [editedGroups, editedImages, editedSectioning, page, saveText, saveImages, saveSectioning])

  const handleReRender = useCallback(() => {
    if (hasApiKey) {
      reRender.mutate(apiKey)
    }
  }, [apiKey, hasApiKey, reRender])

  const [isSaveAndReRendering, setIsSaveAndReRendering] = useState(false)
  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set())

  const handleSaveAndReRender = useCallback(async () => {
    setIsSaveAndReRendering(true)
    try {
      await handleSave()
      if (hasApiKey) {
        reRender.mutate(apiKey)
      }
    } finally {
      setIsSaveAndReRendering(false)
    }
  }, [handleSave, apiKey, hasApiKey, reRender])

  const hasChanges =
    (editedGroups && JSON.stringify(editedGroups) !== JSON.stringify(page?.textClassification)) ||
    (editedImages && JSON.stringify(editedImages) !== JSON.stringify(page?.imageClassification)) ||
    (editedSectioning && JSON.stringify(editedSectioning) !== JSON.stringify(page?.sectioning)) ||
    false

  // Find prev/next pages for navigation (computed before hooks that depend on them)
  const currentIndex = allPages?.findIndex((p) => p.pageId === pageId) ?? -1
  const prevPage = currentIndex > 0 ? allPages?.[currentIndex - 1] : null
  const nextPage =
    allPages && currentIndex < allPages.length - 1
      ? allPages[currentIndex + 1]
      : null

  // Keyboard navigation: arrow keys for prev/next page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when focus is in an editable element
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if ((e.target as HTMLElement)?.isContentEditable) return

      if (e.key === "ArrowLeft" && prevPage) {
        e.preventDefault()
        navigate({
          to: "/books/$label/pages/$pageId",
          params: { label, pageId: prevPage.pageId },
        })
      } else if (e.key === "ArrowRight" && nextPage) {
        e.preventDefault()
        navigate({
          to: "/books/$label/pages/$pageId",
          params: { label, pageId: nextPage.pageId },
        })
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [navigate, label, prevPage, nextPage])

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

  // Combine all section HTMLs into a single preview
  const combinedHtml = page.rendering?.sections
    .map((s) => s.html)
    .join("\n")

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Compact header: breadcrumb + nav + toolbar in one row */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-1.5">
        <div className="flex items-center gap-2">
          <Link to="/books/$label/storyboard" params={{ label }} search={{ page: pageId }}>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <ArrowLeft className="mr-1 h-3 w-3" />
              Storyboard
            </Button>
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
          isSaving={saveText.isPending || saveImages.isPending || saveSectioning.isPending}
          isReRendering={reRender.isPending}
          hasApiKey={hasApiKey}
          hasRenderingData={!!page.textClassification}
          isSaveAndReRendering={isSaveAndReRendering}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
          onReRender={handleReRender}
          onSaveAndReRender={handleSaveAndReRender}
        />
      </div>

      {/* Success banner */}
      {reRender.isSuccess && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-green-50 px-4 py-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Page re-rendered successfully.
            {page.rendering?.sections.some((s) => isActivitySection(s.sectionType) && s.sectionType !== "activity_open_ended_answer") &&
              " Activity answers were also regenerated."}
          </span>
          <Button variant="ghost" size="sm" onClick={() => reRender.reset()}>
            Dismiss
          </Button>
        </div>
      )}

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
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-4 py-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Pipeline Inputs</span>
            {isEditing && <Badge variant="secondary" className="text-xs">Editing</Badge>}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {/* Workflow hint card — view mode only */}
            {!isEditing && !pageGuideDismissed && (
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-primary">Editing workflow</p>
                  <button
                    type="button"
                    onClick={dismissPageGuide}
                    className="rounded p-0.5 text-primary/50 hover:text-primary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <ol className="list-inside list-decimal space-y-0.5 text-xs text-foreground">
                  <li>Click <strong>Edit</strong> to modify text, images, and sections</li>
                  <li><strong>Save</strong> your changes</li>
                  <li>Click <strong>Re-render</strong> to regenerate this page</li>
                </ol>
              </div>
            )}

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
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-4 py-1.5">
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
            {isEditing && editedSectioning ? (
              <SectionEditor
                sections={editedSectioning.sections}
                reasoning={editedSectioning.reasoning}
                onChange={(sections) =>
                  setEditedSectioning({ ...editedSectioning, sections })
                }
                textGroups={
                  (editedGroups ?? page.textClassification)?.groups.map((g) => ({
                    groupId: g.groupId,
                    groupType: g.groupType,
                  })) ?? []
                }
                images={
                  (editedImages ?? page.imageClassification)?.images ?? []
                }
              />
            ) : page.rendering && page.sectioning ? (
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
                          {formatSectionType(section.sectionType)}
                        </Badge>
                        {isActivitySection(section.sectionType) && (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                            Activity
                            {section.activityAnswers && Object.keys(section.activityAnswers).length > 0 &&
                              ` (${Object.keys(section.activityAnswers).length})`}
                          </Badge>
                        )}
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
                        {section.activityReasoning && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {section.activityReasoning}
                          </p>
                        )}
                        {section.activityAnswers && Object.keys(section.activityAnswers).length > 0 && (
                          <div className="mt-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-green-700"
                              onClick={() => {
                                setExpandedAnswers((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(i)) next.delete(i)
                                  else next.add(i)
                                  return next
                                })
                              }}
                            >
                              {expandedAnswers.has(i) ? "Hide Answers" : "Show Answers"}
                            </Button>
                            {expandedAnswers.has(i) && (
                              <div className="mt-2">
                                <ActivityAnswerPanel
                                  answers={section.activityAnswers}
                                  reasoning={section.activityReasoning}
                                />
                              </div>
                            )}
                          </div>
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
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-4 py-2">
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
