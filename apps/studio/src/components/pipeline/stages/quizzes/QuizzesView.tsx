import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  CheckCircle2,
  HelpCircle,
  Loader2,
  ImageOff,
  Trash2,
  Search,
  X,
  Plus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { QuizGenerationOutput } from "@/api/client";
import { useQuizzes } from "@/hooks/use-quizzes";
import { usePageImage, usePages } from "@/hooks/use-pages";
import { formatPageNumbers } from "./lib/format-page-numbers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStepHeader } from "../../components/StepViewRouter";
import { StageContentGuard } from "../../components/StageContentGuard";
import { StageEmptyState } from "../../components/StageEmptyState";
import { VersionPicker } from "../../components/VersionPicker";
import { usePendingChanges } from "../../components/change-summary";
import {
  getRequestedPageId,
  getQuizImageRenderState,
} from "./lib/quizzes-image-state";
import { QuizzesHintBanner } from "./components/QuizzesHintBanner";
import { QuizJumper, type QuizJumperEntry } from "./components/QuizJumper";
import { PageLightbox } from "../../components/PageLightbox";
import { AddQuizDialog } from "./AddQuizDialog";
import { useApiKey } from "@/hooks/use-api-key";
import { useStageStatus } from "@/hooks/use-stage-status";
import { useLingui } from "@lingui/react/macro";

type QuizData = QuizGenerationOutput;

function PageThumb({
  bookLabel,
  pageId,
  onClick,
}: {
  bookLabel: string;
  pageId: string;
  onClick: () => void;
}) {
  const { t } = useLingui();
  const [requestImage, setRequestImage] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (requestImage) return;
    if (typeof IntersectionObserver === "undefined") {
      setRequestImage(true);
      return;
    }
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRequestImage(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [requestImage]);

  const {
    data: imageData,
    isLoading,
    isError,
  } = usePageImage(bookLabel, getRequestedPageId(pageId, requestImage));
  const imageState = getQuizImageRenderState({
    isRequested: requestImage,
    isLoading,
    isError,
    hasImage: !!imageData,
  });

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseEnter={() => setRequestImage(true)}
      onFocus={() => setRequestImage(true)}
      aria-label={t`Open page preview for ${pageId}`}
      className="shrink-0 rounded border border-border bg-muted/40 overflow-hidden hover:ring-2 hover:ring-ring transition-shadow cursor-pointer"
    >
      {imageState === "ready" ? (
        <img
          src={`data:image/png;base64,${imageData!.imageBase64}`}
          alt={t`Page ${pageId}`}
          loading="lazy"
          className="h-44 w-auto block"
        />
      ) : imageState === "error" ? (
        <div className="h-44 w-32 flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          <span>{t`No image`}</span>
        </div>
      ) : (
        <div className="h-44 w-32 flex items-center justify-center px-2 text-[10px] text-muted-foreground">
          {t`Page ${pageId}`}
        </div>
      )}
    </button>
  );
}

export function QuizzesView({
  bookLabel,
  selectedPageId,
}: {
  bookLabel: string;
  selectedPageId?: string;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuizzes(bookLabel);
  const { data: pages } = usePages(bookLabel);
  const { setExtra } = useStepHeader();
  const { hasApiKey } = useApiKey();
  const quizzesStatus = useStageStatus("quizzes");
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const pageNumberById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pages ?? []) m.set(p.pageId, p.pageNumber);
    return m;
  }, [pages]);

  const [pending, setPending] = useState<QuizData | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lightboxPageId, setLightboxPageId] = useState<string | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reset pending when data changes
  useEffect(() => {
    setPending(null);
  }, [data?.version]);

  const effective = pending ?? data?.quizzes;
  const quizzes = effective?.quizzes ?? [];

  const {
    label: pendingLabel,
    labelKey: pendingLabelKey,
    hasChanges: dirty,
  } = usePendingChanges({
    prev: data?.quizzes?.quizzes ?? [],
    next: pending?.quizzes,
    keyOf: (q) => String(q.quizIndex),
    isEqual: (a, b) =>
      a.question === b.question &&
      a.answerIndex === b.answerIndex &&
      JSON.stringify(a.options) === JSON.stringify(b.options),
    noun: { one: t`quiz`, other: t`quizzes` },
  });

  const displayQuizzes = selectedPageId
    ? quizzes.filter((q) => q.pageIds.includes(selectedPageId))
    : quizzes;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredQuizzes = normalizedQuery
    ? displayQuizzes.filter((q) => {
        const haystack = [
          q.question,
          ...q.options.flatMap((o) => [o.text, o.explanation]),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : displayQuizzes;

  const visibleQuizKey = filteredQuizzes
    .map((q) => quizzes.indexOf(q))
    .join(",");

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-quiz-id]"),
    );
    if (cards.length === 0) return;
    const tops = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.quizId;
          if (!id) continue;
          if (entry.isIntersecting) tops.set(id, entry.boundingClientRect.top);
          else tops.delete(id);
        }
        let bestId: string | null = null;
        let bestTop = Infinity;
        for (const [id, top] of tops) {
          if (top < bestTop) {
            bestTop = top;
            bestId = id;
          }
        }
        if (bestId) setActiveQuizId(bestId);
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [visibleQuizKey, setActiveQuizId]);

  const scrollToQuiz = useCallback((id: string) => {
    setSearchQuery("");
    setActiveQuizId(id);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-quiz-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const jumperEntries: QuizJumperEntry[] = useMemo(
    () =>
      displayQuizzes.map((quiz) => {
        const originalIndex = quizzes.indexOf(quiz);
        const pageNumbers = quiz.pageIds
          .map((id) => pageNumberById.get(id))
          .filter((n): n is number => n != null);
        return {
          id: String(originalIndex),
          index: originalIndex,
          question: quiz.question,
          pagesLabel: formatPageNumbers(pageNumbers),
        };
      }),
    [displayQuizzes, quizzes, pageNumberById],
  );

  const saveQuizzes = useCallback(async () => {
    if (!pending) return;
    setSaving(true);
    const minDelay = new Promise((r) => setTimeout(r, 400));
    await api.updateQuizzes(bookLabel, pending);
    setPending(null);
    await queryClient.invalidateQueries({
      queryKey: ["books", bookLabel, "quizzes"],
    });
    await minDelay;
    setSaving(false);
  }, [pending, bookLabel, queryClient]);

  const saveRef = useRef(saveQuizzes);
  saveRef.current = saveQuizzes;

  // Remove a quiz from the book. Operates on the currently visible list (so any
  // unsaved edits are preserved), renumbers quizIndex, and persists immediately.
  // A removed quiz can still be recovered from version history.
  const deleteQuiz = useCallback(
    async (idx: number) => {
      const base = pending ?? data?.quizzes;
      if (!base) return;
      setDeleting(true);
      const next: QuizData = {
        ...base,
        quizzes: base.quizzes
          .filter((_, i) => i !== idx)
          .map((q, i) => ({ ...q, quizIndex: i })),
      };
      await api.updateQuizzes(bookLabel, next);
      setPending(null);
      await queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "quizzes"],
      });
      setDeleting(false);
      setConfirmDeleteIdx(null);
    },
    [pending, data?.quizzes, bookLabel, queryClient],
  );

  useEffect(() => {
    if (!data?.quizzes) return;
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <VersionPicker
          step="quiz-generation"
          itemId="book"
          currentVersion={data.version}
          saving={saving}
          dirty={dirty}
          bookLabel={bookLabel}
          pendingLabel={pendingLabel}
          pendingLabelKey={pendingLabelKey}
          onPreview={(d) => setPending(d as QuizData)}
          onSave={() => saveRef.current()}
          onDiscard={() => setPending(null)}
        />
      </div>,
    );
    return () => setExtra(null);
  }, [
    data,
    displayQuizzes.length,
    saving,
    dirty,
    bookLabel,
    selectedPageId,
    pendingLabel,
    pendingLabelKey,
    setExtra,
  ]);

  const updateQuestion = (idx: number, question: string) => {
    const base = pending ?? data?.quizzes;
    if (!base) return;
    setPending({
      ...base,
      quizzes: base.quizzes.map((q, i) => (i === idx ? { ...q, question } : q)),
    });
  };

  const updateOptionText = (quizIdx: number, optIdx: number, text: string) => {
    const base = pending ?? data?.quizzes;
    if (!base) return;
    setPending({
      ...base,
      quizzes: base.quizzes.map((q, i) =>
        i === quizIdx
          ? {
              ...q,
              options: q.options.map((o, j) =>
                j === optIdx ? { ...o, text } : o,
              ),
            }
          : q,
      ),
    });
  };

  const updateOptionExplanation = (
    quizIdx: number,
    optIdx: number,
    explanation: string,
  ) => {
    const base = pending ?? data?.quizzes;
    if (!base) return;
    setPending({
      ...base,
      quizzes: base.quizzes.map((q, i) =>
        i === quizIdx
          ? {
              ...q,
              options: q.options.map((o, j) =>
                j === optIdx ? { ...o, explanation } : o,
              ),
            }
          : q,
      ),
    });
  };

  const showPerPageEmpty =
    selectedPageId && displayQuizzes.length === 0 && quizzes.length > 0;

  return (
    <StageContentGuard
      stageSlug="quizzes"
      isLoading={isLoading && !effective}
      loadingLabel={t`Loading quizzes...`}
      showRunCard={false}
      runCard={null}
    >
      {showPerPageEmpty ? (
        <StageEmptyState
          icon={HelpCircle}
          color="orange"
          title={t`No quizzes for this page`}
          subtitle={t`Quizzes are linked to other pages in this book`}
        />
      ) : (
        <div className="flex flex-1 flex-col">
          <QuizzesHintBanner />
          <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t`Search questions or options…`}
                className="h-8 w-full rounded-md border border-border/70 bg-background pl-8 pr-8 text-[12px] placeholder:text-muted-foreground/60 transition-colors focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label={t`Clear search`}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                {normalizedQuery
                  ? t`${String(filteredQuizzes.length)} of ${String(displayQuizzes.length)}`
                  : t`${String(displayQuizzes.length)} questions`}
              </span>
              <QuizJumper
                quizzes={jumperEntries}
                activeId={activeQuizId}
                onJump={scrollToQuiz}
              />
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-orange-600 text-xs text-white hover:bg-orange-700"
                disabled={!hasApiKey || quizzesStatus.isRunning}
                title={
                  !hasApiKey
                    ? t`Add an API key in Book settings to add a quiz.`
                    : quizzesStatus.isRunning
                      ? t`Quizzes are generating. Wait for the run to finish before adding a quiz.`
                      : undefined
                }
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t`Add quiz`}
              </Button>
            </div>
          </div>
          <div ref={listRef} className="space-y-2 p-4">
            {filteredQuizzes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <Search className="mb-2 h-5 w-5 opacity-40" />
                <p className="text-sm font-medium">{t`No quizzes match your search`}</p>
              </div>
            ) : (
              filteredQuizzes.map((quiz) => {
            const idx = quizzes.indexOf(quiz);
            const fromLabel = formatPageNumbers(
              quiz.pageIds
                .map((id) => pageNumberById.get(id))
                .filter((n): n is number => n != null),
            );
            const afterNumber = pageNumberById.get(quiz.afterPageId);
            return (
              <div
                key={idx}
                data-quiz-id={String(idx)}
                className="relative scroll-mt-24 rounded-md border bg-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setConfirmDeleteIdx(idx)}
                  aria-label={t`Delete this quiz`}
                  title={t`Delete this quiz`}
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="flex flex-col gap-1.5 px-4 py-2 pr-12 bg-muted/20 border-b">
                  {quiz.pageIds.length > 0 ? (
                    <>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {fromLabel ? t`Generated from pages ${fromLabel}` : t`Generated from these pages`}
                      </span>
                      <div className="flex flex-wrap items-end gap-2">
                        {quiz.pageIds.map((pageId) => {
                          const pageNumber = pageNumberById.get(pageId);
                          return (
                            <div
                              key={pageId}
                              className="flex flex-col items-center gap-1"
                            >
                              <PageThumb
                                bookLabel={bookLabel}
                                pageId={pageId}
                                onClick={() => setLightboxPageId(pageId)}
                              />
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {pageNumber != null
                                  ? t`Page ${String(pageNumber)}`
                                  : pageId}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {afterNumber != null ? t`After page ${afterNumber}` : t`After ${quiz.afterPageId}`}
                    </span>
                  )}
                </div>
                <div className="px-4 py-3">
                  <textarea
                    value={quiz.question}
                    onChange={(e) => updateQuestion(idx, e.target.value)}
                    className="w-full text-sm font-medium leading-relaxed resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                    rows={1}
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 inline-block">
                    {afterNumber != null ? t`Shown after page ${afterNumber}` : t`After ${quiz.afterPageId}`}
                  </span>
                </div>
                <div className="px-4 pb-3 space-y-1.5">
                  {quiz.options.map((option, i) => {
                    const isCorrect = i === quiz.answerIndex;
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 transition-colors ${
                          isCorrect ? "border-l-2 border-l-emerald-500" : ""
                        }`}
                      >
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 mt-1.5 ${
                            isCorrect
                              ? "text-emerald-600"
                              : "text-muted-foreground/25"
                          }`}
                          aria-label={isCorrect ? t`Correct answer` : undefined}
                        />
                        <div className="flex-1 min-w-0">
                          <textarea
                            value={option.text}
                            onChange={(e) =>
                              updateOptionText(idx, i, e.target.value)
                            }
                            className="w-full text-sm leading-relaxed resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                            rows={1}
                          />
                          <textarea
                            value={option.explanation}
                            onChange={(e) =>
                              updateOptionExplanation(idx, i, e.target.value)
                            }
                            className="w-full text-xs leading-relaxed text-muted-foreground resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 mt-0.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                            rows={1}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {quiz.reasoning && (
                    <p className="text-xs italic text-muted-foreground px-1 pt-1">
                      {quiz.reasoning}
                    </p>
                  )}
                </div>
              </div>
            );
              })
            )}
          <AddQuizDialog
            open={showAdd}
            onOpenChange={setShowAdd}
            bookLabel={bookLabel}
          />
          <PageLightbox
            bookLabel={bookLabel}
            pageId={lightboxPageId}
            open={lightboxPageId != null}
            onOpenChange={(open) => {
              if (!open) setLightboxPageId(null);
            }}
          />
          <Dialog
            open={confirmDeleteIdx != null}
            onOpenChange={(open) => {
              if (!open && !deleting) setConfirmDeleteIdx(null);
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t`Delete this quiz?`}</DialogTitle>
                <DialogDescription>
                  {t`This quiz will be removed from the book. You can still restore it from the version history.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDeleteIdx(null)}
                  disabled={deleting}
                >
                  {t`Cancel`}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    confirmDeleteIdx != null && deleteQuiz(confirmDeleteIdx)
                  }
                  disabled={deleting}
                >
                  {deleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t`Deleting…`}
                    </>
                  ) : (
                    t`Delete quiz`
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      )}
    </StageContentGuard>
  );
}
