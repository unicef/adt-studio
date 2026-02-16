import { useState, useCallback, useMemo, useImperativeHandle, forwardRef } from "react"
import {
  FileText,
  Image,
  Layers,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ImageOff,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  FileImage,
  PanelLeftOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePage, usePageImage } from "@/hooks/use-pages"
import { useReRenderPage } from "@/hooks/use-page-mutations"
import { useInlinePageEdit } from "@/hooks/use-inline-page-edit"
import { useApiKey } from "@/hooks/use-api-key"
import { TextGroupList } from "@/components/page-edit/TextGroupList"
import { ImageList } from "@/components/page-edit/ImageList"
import { SectionList } from "@/components/page-edit/SectionList"
import { FloatingSaveBar } from "@/components/page-edit/FloatingSaveBar"
import { RenderedHtml } from "@/components/storyboard/RenderedHtml"
import { ActivityAnswerPanel } from "@/components/storyboard/ActivityAnswerPanel"
import { OriginalPageColumn, OriginalPageSheet } from "./OriginalPagePanel"
import { isActivitySection, formatSectionType } from "@/lib/activity-utils"

export interface PageEditPanelHandle {
  hasChanges: boolean
  changedEntities: string[]
  save: () => Promise<void>
  discard: () => void
}

interface PageEditPanelProps {
  label: string
  pageId: string
  pageNumber: number
  showOriginalImage: boolean
  onToggleOriginalImage: () => void
  sidebarVisible: boolean
  onExpandSidebar: () => void
}

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

export const PageEditPanel = forwardRef<PageEditPanelHandle, PageEditPanelProps>(
  function PageEditPanel(
    { label, pageId, pageNumber, showOriginalImage, onToggleOriginalImage, sidebarVisible, onExpandSidebar },
    ref
  ) {
    const { data: page, isLoading, error } = usePage(label, pageId)
    const { apiKey, hasApiKey } = useApiKey()
    const reRender = useReRenderPage(label, pageId)
    const edit = useInlinePageEdit(label, pageId, page)

    const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set())

    useImperativeHandle(
      ref,
      () => ({
        get hasChanges() {
          return edit.hasChanges
        },
        get changedEntities() {
          return edit.changedEntities
        },
        save: edit.save,
        discard: edit.discard,
      }),
      [edit.hasChanges, edit.changedEntities, edit.save, edit.discard]
    )

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

    const combinedHtml = useMemo(
      () => page?.rendering?.sections.map((s) => s.html).join("\n"),
      [page]
    )

    const hasRenderingData = !!page?.textClassification

    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center p-4 text-destructive">
          Failed to load page: {error.message}
        </div>
      )
    }

    if (!page) return null

    return (
      <div className="relative flex flex-1 min-h-0 flex-col">
        {/* Success banner */}
        {reRender.isSuccess && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-green-50 px-4 py-1.5 text-xs text-green-800">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            Page re-rendered successfully.
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-5 px-2 text-xs"
              onClick={() => reRender.reset()}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Error banner */}
        {reRender.error && !reRender.isPending && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
            <AlertCircle className="h-3 w-3 shrink-0" />
            Re-render failed: {reRender.error.message}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-5 px-2 text-xs"
              onClick={() => reRender.reset()}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Two/three-column layout: Inputs | Output | (Original) */}
        <div className="flex min-h-0 flex-1">
          {/* Inputs + Output grid */}
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_3fr] gap-0 divide-x">
            {/* Left: Inputs */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-4 py-1.5">
                {!sidebarVisible && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 -ml-1"
                    onClick={onExpandSidebar}
                    title="Show page list"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                )}
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Inputs</span>
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

            {/* Right: Output — tabs for Preview vs By Section */}
            <Tabs defaultValue="preview" className="flex flex-col overflow-hidden">
              <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-4 py-1.5">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Output</span>
                {reRender.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                <TabsList className="h-7">
                  <TabsTrigger value="preview" className="px-2.5 py-1 text-xs">
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="sections" className="px-2.5 py-1 text-xs">
                    By Section{page.rendering ? ` (${page.rendering.sections.length})` : ""}
                  </TabsTrigger>
                </TabsList>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    variant={showOriginalImage ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7"
                    onClick={onToggleOriginalImage}
                    title={showOriginalImage ? "Hide original page" : "Show original page"}
                  >
                    <FileImage className="mr-1 h-3 w-3" />
                    Original
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={handleReRender}
                    disabled={!hasApiKey || reRender.isPending || !hasRenderingData}
                    title={
                      !hasApiKey
                        ? "Set your API key first"
                        : !hasRenderingData
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
                                {section.activityAnswers &&
                                  Object.keys(section.activityAnswers).length > 0 &&
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
                              <Badge variant="secondary" className="text-xs">
                                Pruned
                              </Badge>
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
                            {section.activityAnswers &&
                              Object.keys(section.activityAnswers).length > 0 && (
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
          </div>

          {/* Original page image — column on xl+, sheet on smaller */}
          {showOriginalImage && (
            <>
              <div className="hidden xl:flex xl:w-[400px] xl:shrink-0">
                <OriginalPageColumn
                  label={label}
                  pageId={pageId}
                  pageNumber={pageNumber}
                />
              </div>
              <div className="xl:hidden">
                <OriginalPageSheet
                  label={label}
                  pageId={pageId}
                  pageNumber={pageNumber}
                  onClose={onToggleOriginalImage}
                />
              </div>
            </>
          )}
        </div>

        {/* Floating save bar — positioned within this panel */}
        <FloatingSaveBar
          changedEntities={edit.changedEntities}
          isSaving={edit.isSaving}
          hasApiKey={hasApiKey}
          onSave={edit.save}
          onSaveAndReRender={handleSaveAndReRender}
          onDiscard={edit.discard}
        />
      </div>
    )
  }
)
