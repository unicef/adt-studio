import { useState, useCallback, useMemo, useImperativeHandle, forwardRef } from "react"
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ImageOff,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileImage,
  HelpCircle,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePage, usePageImage } from "@/hooks/use-pages"
import { useReRenderPage } from "@/hooks/use-page-mutations"
import { useInlinePageEdit } from "@/hooks/use-inline-page-edit"
import { useQuizzes } from "@/hooks/use-quizzes"
import { useTTS } from "@/hooks/use-tts"
import { useApiKey } from "@/hooks/use-api-key"
import { TextGroupList } from "@/components/page-edit/TextGroupList"
import { ImageList } from "@/components/page-edit/ImageList"
import { SectionList } from "@/components/page-edit/SectionList"
import { FloatingSaveBar } from "@/components/page-edit/FloatingSaveBar"
import { RenderedHtml } from "@/components/storyboard/RenderedHtml"
import { ActivityAnswerPanel } from "@/components/storyboard/ActivityAnswerPanel"
import { OriginalPageColumn, OriginalPageSheet } from "./OriginalPagePanel"
import { isActivitySection, formatSectionType } from "@/lib/activity-utils"
import type { QuizItem } from "@/api/client"

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
    <div className="mt-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        Image Captions ({captions.length})
      </h3>
      <div className="space-y-3">
        {captions.map((cap) => (
          <div key={cap.imageId} className="rounded border p-2.5">
            <div className="flex items-start gap-2.5">
              <img
                src={`/api/books/${bookLabel}/images/${cap.imageId}`}
                alt={cap.caption}
                className="h-12 w-12 shrink-0 rounded border object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = "none"
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs">{cap.caption}</p>
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

function QuizCard({ quiz }: { quiz: QuizItem }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2.5 p-3 text-left cursor-pointer"
      >
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">{quiz.question}</p>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-1.5">
          {quiz.options.map((option, i) => {
            const isCorrect = i === quiz.answerIndex
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md p-2 text-xs ${
                  isCorrect
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50/50 border border-red-100"
                }`}
              >
                {isCorrect ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-3 w-3 text-red-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className={isCorrect ? "font-medium" : ""}>{option.text}</p>
                  {option.explanation && (
                    <p className="mt-0.5 text-muted-foreground">{option.explanation}</p>
                  )}
                </div>
              </div>
            )
          })}
          {quiz.reasoning && (
            <p className="mt-1.5 text-xs text-muted-foreground italic">{quiz.reasoning}</p>
          )}
        </div>
      )}
    </div>
  )
}

function PageQuizList({ quizzes }: { quizzes: QuizItem[] }) {
  if (quizzes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <HelpCircle className="h-6 w-6" />
          No quizzes for this page yet.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {quizzes.map((quiz) => (
        <QuizCard key={quiz.quizIndex} quiz={quiz} />
      ))}
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

    const { audioMap } = useTTS(label)
    const { data: quizData } = useQuizzes(label)
    const pageQuizzes = useMemo(() => {
      const all = quizData?.quizzes?.quizzes ?? []
      return all.filter((q) => q.pageIds.includes(pageId))
    }, [quizData, pageId])

    const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set())
    const [inputsExpanded, setInputsExpanded] = useState(true)

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
          {/* Inputs column — collapsible */}
          {inputsExpanded && (
            <div className="flex w-[360px] shrink-0 flex-col overflow-hidden border-r">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
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
                <span className="text-xs font-medium text-muted-foreground">Inputs</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 w-7 p-0"
                  onClick={() => setInputsExpanded(false)}
                  title="Collapse inputs"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-3">
                {/* Text classification */}
                {edit.effectiveGroups ? (
                  <div className="mb-4">
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      Text Groups ({edit.effectiveGroups.groups.length})
                    </h3>
                    <TextGroupList
                      groups={edit.effectiveGroups.groups}
                      draftGroups={edit.draftGroups}
                      serverGroups={page.textClassification}
                      onUpdate={edit.updateGroups}
                      audioMap={audioMap}
                    />
                  </div>
                ) : page.textClassification ? (
                  <div className="mb-4">
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      Text Groups ({page.textClassification.groups.length})
                    </h3>
                    <div className="space-y-2">
                      {page.textClassification.groups.map((group) => (
                        <div key={group.groupId} className="group/card rounded border p-2.5">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{group.groupType}</Badge>
                            <span className="text-xs text-muted-foreground">{group.groupId}</span>
                          </div>
                          <div className="space-y-0.5">
                            {group.texts.map((t, i) => (
                              <div
                                key={i}
                                className={`text-xs ${t.isPruned ? "text-muted-foreground line-through" : ""}`}
                              >
                                <span className="mr-1 text-muted-foreground">[{t.textType}]</span>
                                {t.text}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mb-4 text-xs text-muted-foreground">
                    No text classification data. Run the pipeline first.
                  </p>
                )}

                {/* Image classification */}
                {edit.effectiveImages && edit.effectiveImages.images.length > 0 ? (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
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
          )}

          {/* Output column — fills remaining space */}
          <Tabs defaultValue="preview" className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
                {!inputsExpanded && (
                  <>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setInputsExpanded(true)}
                      title="Show inputs"
                    >
                      <PanelRightClose className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <span className="text-xs font-medium text-muted-foreground">Output</span>
                {reRender.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                <TabsList className="h-7">
                  <TabsTrigger value="preview" className="px-2.5 py-1 text-xs">
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="sections" className="px-2.5 py-1 text-xs">
                    By Section{page.rendering ? ` (${page.rendering.sections.length})` : ""}
                  </TabsTrigger>
                  {pageQuizzes.length > 0 && (
                    <TabsTrigger value="quizzes" className="px-2.5 py-1 text-xs">
                      Quizzes ({pageQuizzes.length})
                    </TabsTrigger>
                  )}
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
                  <div className="flex h-full items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      Re-rendering page...
                    </div>
                  </div>
                ) : combinedHtml ? (
                  <RenderedHtml
                    html={combinedHtml}
                    className="prose prose-sm mx-auto max-w-3xl rounded border bg-white p-4 font-sans"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
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
                  <div className="flex h-full items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <ImageOff className="h-6 w-6" />
                      No sections. Run the pipeline first.
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="quizzes" className="mt-0 flex-1 overflow-auto p-4">
                <PageQuizList quizzes={pageQuizzes} />
              </TabsContent>
          </Tabs>

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
