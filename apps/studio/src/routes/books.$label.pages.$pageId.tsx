import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState, useCallback, useEffect, useRef } from "react"
import { ArrowLeft, ArrowRight, FileText, Image, Layers, Loader2, AlertCircle, CheckCircle2, ImageOff, RefreshCw, ChevronDown, ChevronRight, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { usePage, usePageImage, usePages } from "@/hooks/use-pages"
import { useReRenderPage } from "@/hooks/use-page-mutations"
import { useInlinePageEdit } from "@/hooks/use-inline-page-edit"
import { useApiKey } from "@/hooks/use-api-key"
import { TextGroupList } from "@/components/page-edit/TextGroupList"
import { ImageList } from "@/components/page-edit/ImageList"
import { SectionList } from "@/components/page-edit/SectionList"
import { FloatingSaveBar } from "@/components/page-edit/FloatingSaveBar"
import { RenderedHtml } from "@/components/storyboard/RenderedHtml"
import { ActivityAnswerPanel } from "@/components/storyboard/ActivityAnswerPanel"
import { isActivitySection, formatSectionType } from "@/lib/activity-utils"

export const Route = createFileRoute("/books/$label/pages/$pageId")({
  component: PageDetailPage,
})

function ImageCaptionList({
  captions,
  bookLabel,
}: {
  captions: Array<{ imageId: string; reasoning: string; caption: string }>
  bookLabel: string
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleReasoning = (imageId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(imageId)) next.delete(imageId)
      else next.add(imageId)
      return next
    })
  }

  return (
    <div className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4" />
        Image Captions ({captions.length})
      </h3>
      <div className="space-y-3">
        {captions.map((cap) => (
          <div key={cap.imageId} className="rounded border p-3">
            <div className="flex items-start gap-3">
              <img
                src={`/api/books/${bookLabel}/images/${cap.imageId}`}
                alt={cap.caption}
                className="h-16 w-16 shrink-0 rounded border object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = "none"
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{cap.caption}</p>
                <button
                  type="button"
                  className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => toggleReasoning(cap.imageId)}
                >
                  {expandedIds.has(cap.imageId) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Reasoning
                </button>
                {expandedIds.has(cap.imageId) && (
                  <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                    {cap.reasoning}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PageDetailPage() {
  const { label, pageId } = Route.useParams()
  const navigate = useNavigate()
  const { data: page, isLoading, error } = usePage(label, pageId)
  const { data: imageData } = usePageImage(label, pageId)
  const { data: allPages } = usePages(label)

  const { apiKey, hasApiKey } = useApiKey()
  const reRender = useReRenderPage(label, pageId)

  const edit = useInlinePageEdit(label, pageId, page)

  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set())
  const [confirmNav, setConfirmNav] = useState<{ to: string; params: Record<string, string> } | null>(null)

  const handleReRender = useCallback(() => {
    if (hasApiKey) {
      reRender.mutate(apiKey)
    }
  }, [apiKey, hasApiKey, reRender])

  const handleSaveAndReRender = useCallback(async () => {
    await edit.save()
    if (hasApiKey) {
      reRender.mutate(apiKey)
    }
  }, [edit.save, hasApiKey, apiKey, reRender])

  // Find prev/next pages for navigation
  const currentIndex = allPages?.findIndex((p) => p.pageId === pageId) ?? -1
  const prevPage = currentIndex > 0 ? allPages?.[currentIndex - 1] : null
  const nextPage =
    allPages && currentIndex < allPages.length - 1
      ? allPages[currentIndex + 1]
      : null

  // Use ref to avoid stale closure in keyboard handler
  const hasChangesRef = useRef(edit.hasChanges)
  hasChangesRef.current = edit.hasChanges
  const discardRef = useRef(edit.discard)
  discardRef.current = edit.discard

  const navigateToPage = useCallback(
    (targetPageId: string) => {
      const target = {
        to: "/books/$label/pages/$pageId" as const,
        params: { label, pageId: targetPageId },
      }
      if (hasChangesRef.current) {
        setConfirmNav(target)
      } else {
        navigate(target)
      }
    },
    [label, navigate]
  )

  const confirmNavigation = useCallback(() => {
    if (confirmNav) {
      discardRef.current()
      navigate(confirmNav)
      setConfirmNav(null)
    }
  }, [confirmNav, navigate])

  // Keyboard navigation: arrow keys for prev/next page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if ((e.target as HTMLElement)?.isContentEditable) return

      if (e.key === "ArrowLeft" && prevPage) {
        e.preventDefault()
        navigateToPage(prevPage.pageId)
      } else if (e.key === "ArrowRight" && nextPage) {
        e.preventDefault()
        navigateToPage(nextPage.pageId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [prevPage, nextPage, navigateToPage])

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

  const combinedHtml = page.rendering?.sections
    .map((s) => s.html)
    .join("\n")

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Compact header: breadcrumb + nav + re-render */}
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
              onClick={() => prevPage && navigateToPage(prevPage.pageId)}
            >
              <ArrowLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!nextPage}
              onClick={() => nextPage && navigateToPage(nextPage.pageId)}
            >
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReRender}
          disabled={!hasApiKey || reRender.isPending || !page?.textClassification}
          title={
            !hasApiKey
              ? "Set your API key first"
              : !page?.textClassification
                ? "Run the pipeline first"
                : reRender.isPending
                  ? "Re-rendering..."
                  : ""
          }
        >
          {reRender.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Re-render
        </Button>
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
          </div>
          <div className="flex-1 overflow-auto p-4">
            {/* Text classification */}
            {edit.effectiveGroups ? (
              <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-3 w-3" />
                  Text Groups ({edit.effectiveGroups.groups.length})
                </h3>
                <TextGroupList
                  groups={edit.effectiveGroups.groups}
                  draftGroups={edit.draftGroups}
                  serverGroups={page.textClassification}
                  onUpdate={edit.updateGroups}
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
                    <div key={group.groupId} className="group/card rounded border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground/70">{group.groupType}</span>
                        <span className="text-xs text-muted-foreground/40 opacity-0 transition-opacity group-hover/card:opacity-100">
                          {group.groupId}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {group.texts.map((t, i) => (
                          <div
                            key={i}
                            className={`group/text flex items-baseline gap-1 text-sm ${t.isPruned ? "text-muted-foreground line-through" : ""}`}
                          >
                            <span className="flex-1">{t.text}</span>
                            <span className="shrink-0 text-xs text-muted-foreground/40 opacity-0 transition-opacity group-hover/text:opacity-100">
                              {t.textType}
                            </span>
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
            {edit.effectiveImages && edit.effectiveImages.images.length > 0 ? (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Image className="h-3 w-3" />
                  Images ({edit.effectiveImages.images.length})
                </h3>
                <ImageList
                  images={edit.effectiveImages.images}
                  bookLabel={label}
                  onUpdate={edit.updateImages}
                />
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

            {/* Image Captions from proof phase */}
            {page.imageCaptioning && page.imageCaptioning.captions.length > 0 && (
              <ImageCaptionList
                captions={page.imageCaptioning.captions}
                bookLabel={label}
              />
            )}
          </TabsContent>

          <TabsContent value="sections" className="mt-0 flex-1 overflow-auto p-4">
            {edit.effectiveSectioning ? (
              <SectionList
                sections={edit.effectiveSectioning.sections}
                draftSectioning={edit.draftSectioning}
                serverSectioning={page.sectioning}
                onUpdate={edit.updateSectioning}
                textGroups={
                  edit.effectiveGroups?.groups.map((g) => ({
                    groupId: g.groupId,
                    groupType: g.groupType,
                  })) ?? []
                }
                images={edit.effectiveImages?.images ?? []}
              />
            ) : page.rendering ? (
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

      {/* Floating save bar */}
      <FloatingSaveBar
        changedEntities={edit.changedEntities}
        isSaving={edit.isSaving}
        hasApiKey={hasApiKey}
        onSave={edit.save}
        onSaveAndReRender={handleSaveAndReRender}
        onDiscard={edit.discard}
      />

      {/* Unsaved changes confirmation dialog */}
      <Dialog open={!!confirmNav} onOpenChange={(open) => !open && setConfirmNav(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes to {edit.changedEntities.join(", ").toLowerCase()}.
              Navigating away will discard them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmNav(null)}>
              Stay on page
            </Button>
            <Button variant="destructive" onClick={confirmNavigation}>
              Discard & navigate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
