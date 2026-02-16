import { CheckCircle2, XCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const MOCK_QUIZZES = [
  {
    id: 1,
    page: 2,
    question: "What happens when the sun heats water in rivers and oceans?",
    options: ["It freezes", "It evaporates", "It becomes salty", "It changes color"],
    correctIndex: 1,
  },
  {
    id: 2,
    page: 3,
    question: "What forms when water vapor cools and condenses?",
    options: ["Clouds", "Ice", "Rivers", "Soil"],
    correctIndex: 0,
  },
  {
    id: 3,
    page: 4,
    question: "How do plants absorb water?",
    options: ["Through their leaves", "Through their flowers", "Through their roots", "Through their bark"],
    correctIndex: 2,
  },
  {
    id: 4,
    page: 5,
    question: "What is the process called when water falls from clouds?",
    options: ["Evaporation", "Condensation", "Precipitation", "Transpiration"],
    correctIndex: 2,
  },
]

export function QuizzesView({ bookLabel: _ }: { bookLabel: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Generated Quizzes</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {MOCK_QUIZZES.length} questions generated from content
        </p>
      </div>

      <div className="space-y-3">
        {MOCK_QUIZZES.map((quiz) => (
          <Card key={quiz.id} className="overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>{quiz.question}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-2">Page {quiz.page}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="grid grid-cols-2 gap-1.5">
                {quiz.options.map((option, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs ${
                      i === quiz.correctIndex
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {i === quiz.correctIndex ? (
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 shrink-0 opacity-30" />
                    )}
                    <span>{option}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
