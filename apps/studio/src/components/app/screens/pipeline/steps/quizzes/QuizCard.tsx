import { memo } from "react";
import { Check, Circle, Trash2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { QuizItem, QuizOption } from "@/api/client";
import { cn } from "@/lib/utils";
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb";
import { formatPageNumbers } from "@/components/pipeline/stages/quizzes/lib/format-page-numbers";
import { EditableText, RowAction, StepCard } from "../shared/ui";
import { Badge } from "@/components/ui/badge";

export const QuizCard = memo(function QuizCard({
    label,
    quiz,
    accent,
    pageNumbers,
    saving,
    onPatchQuiz,
    onPatchOption,
    onOpenPage,
    onRequestDelete,
}: {
    label: string;
    quiz: QuizItem;
    accent: string;
    pageNumbers: Map<string, number>;
    saving: boolean;
    onPatchQuiz: (quizIndex: number, changes: Partial<QuizItem>) => void;
    onPatchOption: (
        quizIndex: number,
        optionIndex: number,
        changes: Partial<QuizOption>,
    ) => void;
    onOpenPage: (pageId: string) => void;
    onRequestDelete: (quizIndex: number) => void;
}) {
    const { t } = useLingui();

    const afterNumber = pageNumbers.get(quiz.afterPageId);
    const sourceLabel = formatPageNumbers(
        quiz.pageIds
            .map((pageId) => pageNumbers.get(pageId))
            .filter((n): n is number => n != null),
    );

    return (
        <StepCard>
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="w-fit h-fit">
                    {t`after page ${afterNumber != null ? String(afterNumber) : "—"}`}
                </Badge>
                <span className="ml-auto">
                    <RowAction
                        icon={Trash2}
                        label={t`Delete this quiz`}
                        tone="danger"
                        onClick={() => onRequestDelete(quiz.quizIndex)}
                    />
                </span>
            </div>

            <EditableText
                value={quiz.question}
                ariaLabel={t`question`}
                multiline={false}
                isSaving={saving}
                onSave={(question) => onPatchQuiz(quiz.quizIndex, { question })}
                className="text-lg font-semibold"
            />

            <ul className="flex flex-col gap-2 bg-secondary border rounded-xl p-2">
                {quiz.options.map((option, index) => {
                    const correct = index === quiz.answerIndex;
                    return (
                        <li
                            key={`${index}:${option.text}`}
                            className="flex items-start gap-2 p-2 bg-background border rounded-xl"
                        >
                            <button
                                type="button"
                                onClick={() =>
                                    onPatchQuiz(quiz.quizIndex, {
                                        answerIndex: index,
                                    })
                                }
                                aria-label={t`Mark option ${index + 1} as the correct answer`}
                                aria-pressed={correct}
                                className="mt-1 grid size-4 shrink-0 place-items-center rounded-full border transition-colors"
                                style={
                                    correct
                                        ? {
                                              background: accent,
                                              borderColor: accent,
                                              color: "white",
                                          }
                                        : undefined
                                }
                            >
                                {correct ? (
                                    <Check
                                        className="size-2.5"
                                        strokeWidth={4}
                                    />
                                ) : (
                                    <Circle className="size-2 opacity-0" />
                                )}
                            </button>
                            <div className="flex min-w-0 flex-1 flex-col">
                                <EditableText
                                    value={option.text}
                                    ariaLabel={t`option ${index + 1}`}
                                    multiline={false}
                                    isSaving={saving}
                                    onSave={(text) =>
                                        onPatchOption(quiz.quizIndex, index, {
                                            text,
                                        })
                                    }
                                    className={cn(
                                        "text-[12.5px]",
                                        correct && "font-semibold",
                                    )}
                                />
                                <EditableText
                                    value={option.explanation}
                                    ariaLabel={t`feedback for option ${index + 1}`}
                                    placeholder={
                                        correct
                                            ? t`Feedback shown when answered correctly…`
                                            : t`Feedback shown when this option is picked…`
                                    }
                                    isSaving={saving}
                                    onSave={(explanation) =>
                                        onPatchOption(quiz.quizIndex, index, {
                                            explanation,
                                        })
                                    }
                                    className="text-[11.5px] leading-relaxed text-muted-foreground"
                                />
                            </div>
                        </li>
                    );
                })}
            </ul>

            <div className="flex w-full justify-between gap-2">
                {quiz.pageIds.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {sourceLabel ? (
                                <Trans>
                                    Generated from pages {sourceLabel}
                                </Trans>
                            ) : (
                                <Trans>Generated from these pages</Trans>
                            )}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {quiz.pageIds.map((pageId) => {
                                const number = pageNumbers.get(pageId);
                                return (
                                    <button
                                        key={pageId}
                                        type="button"
                                        onClick={() => onOpenPage(pageId)}
                                        title={t`Open page preview`}
                                        aria-label={
                                            number != null
                                                ? t`Open preview of page ${number}`
                                                : t`Open page preview`
                                        }
                                        className={cn(
                                            "flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-muted",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        )}
                                    >
                                        <PageThumb
                                            label={label}
                                            pageId={pageId}
                                            sectionIndex={null}
                                            className="h-[72px] w-[52px]"
                                        />
                                        <span className="font-mono text-[10px] text-muted-foreground">
                                            {number != null
                                                ? t`Page ${String(number)}`
                                                : pageId}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

            </div>

            {quiz.reasoning && (
                <p
                    className="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
                >
                    {quiz.reasoning}
                </p>
            )}
        </StepCard>
    );
});
