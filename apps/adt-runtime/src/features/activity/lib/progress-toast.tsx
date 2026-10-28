/**
 * Submission-result toast for text-input activities. Replaces the legacy
 * `#toast` div from `utils.js:updateSubmitButtonAndToast` with a sonner custom
 * toast that:
 *   - keeps the original pastel background + colored left border + dark gray
 *     text styling (high contrast, readable at distance)
 *   - replaces the legacy single-line "X blanks remaining" with a per-bucket
 *     breakdown: correct / to review / empty
 */

import { toast } from "sonner"
import { isActivityBatch } from "../runtime/activity-scope"
import { getDefaultStore } from "jotai"
import { translationsAtom } from "../../language/state/language.atoms"

export interface ProgressResult {
  total: number
  correct: number
  unfilled: number
}

type ToastTone = "success" | "warning"

interface ToastVariantStyle {
  /** Pastel background. */
  bg: string
  /** Darker matching border on the left. */
  border: string
  /** Aria role: success → status; warning → alert (assertive). */
  role: "status" | "alert"
}

const VARIANTS: Record<ToastTone, ToastVariantStyle> = {
  success: {
    bg: "bg-green-100",
    border: "border-green-600",
    role: "status",
  },
  warning: {
    bg: "bg-yellow-100",
    border: "border-yellow-600",
    role: "alert",
  },
}

function tr(key: string, fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  return dict[key] || fallback
}

function trChain(keys: string[], fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  for (const key of keys) {
    if (dict[key]) return dict[key]
  }
  return fallback
}

export interface ProgressToastOptions {
  correctLabel?: string
  wrongLabel?: string
  emptyLabel?: string
  allCorrectMessage?: string
}

interface ProgressToastViewProps {
  toastId: string | number
  tone: ToastTone
  emoji: string
  message: string
  closeLabel: string
}

function ProgressToastView({
  toastId,
  tone,
  emoji,
  message,
  closeLabel,
}: ProgressToastViewProps) {
  const variant = VARIANTS[tone]
  return (
    <div
      role={variant.role}
      aria-live={variant.role === "alert" ? "assertive" : "polite"}
      className={
        // Pastel bg + thick left border + dark gray text mirrors the legacy
        // toast and gives high contrast in both light and dark mode.
        `relative flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 ` +
        `shadow-lg min-w-[18rem] max-w-md ` +
        `${variant.bg} ${variant.border}`
      }
    >
      <span aria-hidden="true" className="text-2xl shrink-0">
        {emoji}
      </span>
      <p className="text-gray-800 font-medium text-base leading-snug flex-1">
        {message}
      </p>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={() => toast.dismiss(toastId)}
        className={
          "absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center " +
          "rounded-full border border-gray-500 bg-white text-gray-600 shadow " +
          "hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400"
        }
      >
        <i className="fas fa-times text-xs" aria-hidden="true" />
      </button>
    </div>
  )
}

export function showActivityProgressToast(
  result: ProgressResult,
  options: ProgressToastOptions = {},
): void {
  if (isActivityBatch()) return
  const { total, correct, unfilled } = result
  const wrong = Math.max(0, total - correct - unfilled)

  if (total === 0) return

  const closeLabel = tr("close", "Close")

  if (correct === total) {
    const message =
      options.allCorrectMessage ??
      trChain(
        ["fitb-toast-all-correct", "answers-submitted", "correct-answer"],
        "All correct!",
      )
    toast.custom(
      (id) => (
        <ProgressToastView
          toastId={id}
          tone="success"
          emoji="🎉"
          message={message}
          closeLabel={closeLabel}
        />
      ),
      { duration: 4000 },
    )
    return
  }

  const correctLabel =
    options.correctLabel ?? tr("activity-progress-correct", "correct")
  const wrongLabel =
    options.wrongLabel ?? tr("activity-progress-to-review", "to review")
  const emptyLabel =
    options.emptyLabel ?? tr("activity-progress-empty", "empty")

  const parts: string[] = []
  if (correct > 0) parts.push(`${correct} ${correctLabel}`)
  if (wrong > 0) parts.push(`${wrong} ${wrongLabel}`)
  if (unfilled > 0) parts.push(`${unfilled} ${emptyLabel}`)

  // Middle-dot reads better than a comma between count-noun pairs and stays
  // on a single line at typical widths.
  toast.custom(
    (id) => (
      <ProgressToastView
        toastId={id}
        tone="warning"
        emoji="✍️"
        message={parts.join(" · ")}
        closeLabel={closeLabel}
      />
    ),
    { duration: 5000 },
  )
}
