import { useMemo } from "react"
import { useHotkey } from "@tanstack/react-hotkeys"
import type { QuizItem } from "@/api/client"
import { buildRailOrder } from "./railOrder"
import type { PipelinePage } from "./usePipelineState"

export interface CanvasNavigationOptions {
  pages: PipelinePage[]
  quizzes: QuizItem[]
  activePageId: string | null
  activeQuizIndex: number | null
  /** Off while the canvas is empty or a step/settings screen owns the view. */
  enabled: boolean
  onSelectPage: (pageId: string) => void
  onSelectQuiz: (quizIndex: number) => void
}

/** A dialog, menu, or popover on top of the canvas owns its own arrow keys.
 *  Text fields are already covered by the hotkey's `ignoreInputs` default. */
function overlayOpen(): boolean {
  return (
    document.querySelector(
      "[role='dialog'][data-state='open'], [role='menu'][data-state='open'], [data-radix-popper-content-wrapper]",
    ) !== null
  )
}

/** Arrow keys walk the rail: left goes back a storyboard page, right forward. */
export function useCanvasNavigation({
  pages,
  quizzes,
  activePageId,
  activeQuizIndex,
  enabled,
  onSelectPage,
  onSelectQuiz,
}: CanvasNavigationOptions): void {
  const order = useMemo(() => buildRailOrder(pages, quizzes), [pages, quizzes])

  const step = (delta: number) => {
    if (overlayOpen()) return

    const current = order.findIndex((item) =>
      activeQuizIndex == null
        ? item.kind === "page" && item.pageId === activePageId
        : item.kind === "quiz" && item.quizIndex === activeQuizIndex,
    )
    if (current === -1) return

    const next = order[current + delta]
    if (!next) return
    if (next.kind === "page") onSelectPage(next.pageId)
    else onSelectQuiz(next.quizIndex)
  }

  useHotkey("ArrowLeft", () => step(-1), { enabled })
  useHotkey("ArrowRight", () => step(1), { enabled })
}
