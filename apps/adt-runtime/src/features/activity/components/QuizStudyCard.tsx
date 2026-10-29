import { useId, useState } from "react"
import { createRoot } from "react-dom/client"
import { useAtomValue } from "jotai"
import { translationsAtom } from "@/features/language/state/language.atoms"

/** A study presentation of the saved answer. It never submits or grades a quiz. */
export function QuizStudyCard({ answer, answerId, explanation, explanationId, onModeChange }: {
  answer: string
  answerId: string
  explanation: string
  explanationId?: string
  onModeChange: (studying: boolean) => void
}) {
  const dict = useAtomValue(translationsAtom)
  const [studying, setStudying] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const answerRegion = useId()
  const tr = (key: string, fallback: string) => dict[key] || fallback
  const answerText = dict[answerId] || answer
  const explanationText = (explanationId && dict[explanationId]) || explanation

  return (
    <div className="my-4 w-full space-y-3 text-slate-900">
      <button type="button" aria-pressed={studying} onClick={() => {
        const next = !studying
        setStudying(next)
        setRevealed(false)
        onModeChange(next)
      }} className="min-h-11 rounded-lg border-2 border-slate-600 bg-white px-4 py-2 font-semibold focus-visible:outline focus-visible:outline-4 focus-visible:outline-blue-700">
        {studying ? tr("study-back-to-quiz", "Back to quiz") : tr("study-card", "Study card")}
      </button>
      {studying && (
        <div className="space-y-4 rounded-xl border-2 border-slate-400 bg-white p-5">
          <p>{tr("study-instructions", "Recall the answer, then reveal it. Studying does not submit a quiz answer.")}</p>
          <button type="button" aria-expanded={revealed} aria-controls={answerRegion}
            onClick={() => setRevealed((value) => !value)}
            className="min-h-11 rounded-lg border-2 border-blue-800 bg-blue-800 px-5 py-2 font-semibold text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-blue-700 focus-visible:outline-offset-2">
            {revealed ? tr("study-hide-answer", "Hide answer") : tr("study-show-answer", "Show answer")}
          </button>
          <div id={answerRegion} aria-live="polite" aria-atomic="true">
            {revealed && <div className="space-y-2 border-t border-slate-300 pt-4">
              <p className="text-xl font-semibold">{answerText}</p>
              {explanationText && <p>{explanationText}</p>}
            </div>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Mount only against the deterministic standalone-quiz markup, with one key. */
export function mountQuizStudyCard(section: HTMLElement, answers: Record<string, boolean>, onModeChange: (studying: boolean) => void): (() => void) | null {
  const correctIds = Object.keys(answers).filter((id) => answers[id])
  if (correctIds.length !== 1) return null
  const answerId = correctIds[0]
  const option = Array.from(section.querySelectorAll<HTMLElement>(".activity-option"))
    .find((element) => element.getAttribute("data-activity-item") === answerId)
  const answer = option?.querySelector<HTMLElement>("[data-id]")
  const choices = option?.parentElement
  // Older/custom layouts keep their existing quiz UI; do not guess at groups.
  if (!answer || !choices || choices.getAttribute("role") !== "group") return null
  const mount = document.createElement("div")
  mount.setAttribute("data-quiz-study", "")
  choices.before(mount)
  const display = choices.style.display
  const root = createRoot(mount)
  root.render(<QuizStudyCard answer={answer.textContent ?? ""} answerId={answerId}
    explanation={option?.getAttribute("data-explanation") ?? ""}
    explanationId={option?.getAttribute("data-explanation-id") ?? undefined}
    onModeChange={(studying) => {
      choices.style.display = studying ? "none" : display
      onModeChange(studying)
    }} />)
  return () => {
    root.unmount()
    mount.remove()
    choices.style.display = display
  }
}
