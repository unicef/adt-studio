/**
 * Quiz recovery for imported ADT pages.
 *
 * A generated quiz survives an export in two halves. Its *text* goes into the
 * shared catalog under stable ids — `qz001_que`, `qz001_o0`, `qz001_o0_exp` —
 * exactly as `buildTextCatalog` wrote them. Its *answer key* is emitted into the
 * quiz page so the runtime can grade without shipping a separate data file:
 *
 *   correctAnswers = JSON.parse('{"qz001_o0":false,"qz001_o1":true,...}')
 *
 * Both halves are machine-readable, so a quiz can be rebuilt into a real
 * `quiz-generation` entity rather than being written off as unrecoverable. The
 * answer key is read from the page, never inferred from the ✅/❌ markers that
 * happen to appear in explanation text — a guess that lands the wrong way marks
 * the wrong answer correct.
 *
 * Recovery is all-or-nothing per quiz. Anything ambiguous (missing question, an
 * option without text, no answer flagged, more than one flagged) returns null so
 * the importer reports the quiz as needing regeneration instead of seeding a
 * quiz that grades incorrectly.
 */
import { parseDocument, DomUtils } from "htmlparser2"

export interface ImportedQuizRecovery {
  sectionId: string
  question: string
  options: Array<{ text: string; explanation: string }>
  answerIndex: number
}

/** Options a stored quiz always has. The schema fixes this at three. */
const QUIZ_OPTION_COUNT = 3

/**
 * The runtime reads its key from `window.correctAnswers` (assigned in an inline
 * script) or from `data-correct-answers` on the section. Accept either, so a
 * page hand-edited into the attribute form still recovers.
 */
function readAnswerKey(html: string, sectionId: string): Record<string, boolean> | null {
  const doc = parseDocument(html)
  const section = DomUtils.findOne(
    (element) => element.type === "tag"
      && (element.attribs?.["data-correct-answers"] !== undefined)
      && (element.attribs?.["data-id"] === sectionId
        || element.attribs?.["data-section-id"] === sectionId
        || element.attribs?.["data-area-id"] === sectionId),
    doc.children,
    true,
  )
  const fromAttribute = section?.attribs?.["data-correct-answers"]
  if (fromAttribute) {
    const parsed = parseAnswerJson(fromAttribute)
    if (parsed) return parsed
  }

  // `JSON.parse('…')` keeps the payload in a quoted JS string, so the match has
  // to respect the quote style the exporter used rather than scanning to the
  // first brace-close.
  const script = html.match(
    /correctAnswers\s*=\s*JSON\.parse\(\s*(['"])([\s\S]*?)\1\s*\)/,
  )
  if (script) {
    const parsed = parseAnswerJson(script[2].replace(/\\(['"\\])/g, "$1"))
    if (parsed) return parsed
  }
  return null
}

function parseAnswerJson(raw: string): Record<string, boolean> | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const key: Record<string, boolean> = {}
  for (const [id, flag] of Object.entries(value as Record<string, unknown>)) {
    if (typeof flag !== "boolean") return null
    key[id] = flag
  }
  return key
}

/**
 * Rebuild one exported quiz from its page and the source text catalog, or
 * return null when anything about it is ambiguous.
 */
export function recoverImportedQuiz(
  html: string,
  sectionId: string,
  texts: Record<string, string>,
): ImportedQuizRecovery | null {
  const question = texts[`${sectionId}_que`]?.trim()
  if (!question) return null

  const answerKey = readAnswerKey(html, sectionId)
  if (!answerKey) return null

  const options: Array<{ text: string; explanation: string }> = []
  const correct: number[] = []
  for (let index = 0; index < QUIZ_OPTION_COUNT; index++) {
    const optionId = `${sectionId}_o${index}`
    const text = texts[optionId]?.trim()
    if (!text) return null
    if (!(optionId in answerKey)) return null
    if (answerKey[optionId]) correct.push(index)
    options.push({ text, explanation: texts[`${optionId}_exp`]?.trim() ?? "" })
  }
  // An extra flagged option means the key describes a different question shape
  // (multi-select, say) than the three-option quiz entity can hold.
  if (correct.length !== 1) return null
  if (Object.keys(answerKey).length !== QUIZ_OPTION_COUNT) return null

  return { sectionId, question, options, answerIndex: correct[0] }
}
