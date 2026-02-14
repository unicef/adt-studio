import { useState } from "react"
import { HelpCircle, Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useQuizzes } from "@/hooks/use-quizzes"
import type { QuizItem } from "@/api/client"

interface QuizPanelProps {
  label: string
}

function QuizCard({ quiz }: { quiz: QuizItem }) {
  const [expanded, setExpanded] = useState(false)
  const pageRange = quiz.pageIds.length === 1
    ? quiz.pageIds[0]
    : `${quiz.pageIds[0]} \u2013 ${quiz.pageIds[quiz.pageIds.length - 1]}`

  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left cursor-pointer"
      >
        <HelpCircle className="mt-0.5 h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{quiz.question}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pages: {pageRange}
          </p>
        </div>
        <div className="shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-2">
          {quiz.options.map((option, i) => {
            const isCorrect = i === quiz.answerIndex
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md p-2.5 text-sm ${
                  isCorrect
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50/50 border border-red-100"
                }`}
              >
                {isCorrect ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 text-red-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className={`text-sm ${isCorrect ? "font-medium" : ""}`}>{option.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{option.explanation}</p>
                </div>
              </div>
            )
          })}
          {quiz.reasoning && (
            <p className="mt-2 text-xs text-muted-foreground italic">
              {quiz.reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function QuizPanel({ label }: QuizPanelProps) {
  const { data: quizData, isLoading } = useQuizzes(label)

  const quizzes = quizData?.quizzes?.quizzes ?? []
  const hasQuizzes = quizzes.length > 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hasQuizzes) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Comprehension Quizzes</h3>
        <Badge variant="secondary" className="text-xs">
          {quizzes.length} quiz{quizzes.length !== 1 && "zes"}
        </Badge>
      </div>

      <div className="space-y-3">
        {quizData?.quizzes?.generatedAt && (
          <p className="text-xs text-muted-foreground">
            Generated {new Date(quizData.quizzes.generatedAt).toLocaleString()}
            {quizData.quizzes.pagesPerQuiz && ` \u00b7 Every ${quizData.quizzes.pagesPerQuiz} pages`}
          </p>
        )}
        {quizzes.map((quiz) => (
          <QuizCard key={quiz.quizIndex} quiz={quiz} />
        ))}
      </div>
    </div>
  )
}
