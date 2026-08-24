import { recoverImportedQuiz } from "@adt/pipeline"
import { QuizGenerationOutput } from "@adt/types"

import { readAdtBundle, type ReadAdtBundle } from "./bundle-reader.js"
import { pageIdFromSection } from "./catalog.js"

/**
 * Rebuild every generated quiz the archive still carries enough data for.
 *
 * The quiz pages sit outside the storyboard (`pageIdFromSection` returns null
 * for them), so a quiz's placement is recovered from its position in the page
 * order: it belongs after the last content page preceding it, and covers the
 * content pages since the previous quiz.
 */
export function recoverImportedQuizzes(
  bundle: ReturnType<typeof readAdtBundle>,
  sourceTexts: Record<string, string>,
): { quizzes: QuizGenerationOutput["quizzes"]; declaredCount: number } {
  const quizzes: QuizGenerationOutput["quizzes"] = []
  let declaredCount = 0
  let covered: string[] = []
  let lastContentPageId: string | null = null

  bundle.pages.forEach((page, index) => {
    const pageId = pageIdFromSection(page.section_id, index)
    if (pageId) {
      if (pageId !== lastContentPageId) {
        covered.push(pageId)
        lastContentPageId = pageId
      }
      return
    }
    declaredCount++
    const recovered = recoverImportedQuiz(
      bundle.pageHtml[page.href] ?? "",
      page.section_id,
      sourceTexts,
    )
    // A quiz with no content pages before it has nothing to be "about"; the
    // stored entity requires an anchor, so leave it for regeneration.
    if (!recovered || !lastContentPageId) {
      covered = []
      return
    }
    quizzes.push({
      quizIndex: quizzes.length,
      afterPageId: lastContentPageId,
      pageIds: covered.length > 0 ? [...covered] : [lastContentPageId],
      question: recovered.question,
      options: recovered.options,
      answerIndex: recovered.answerIndex,
      reasoning: "Recovered from the exported ADT quiz page and its text catalog.",
    })
    covered = []
  })

  return { quizzes, declaredCount }
}
