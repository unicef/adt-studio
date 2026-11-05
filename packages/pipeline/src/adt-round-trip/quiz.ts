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
  options: Array<{ text: string; explanation: string; optionId?: string }>
  answerIndex: number
}

/** Options a stored quiz always has. The schema fixes this at three. */
const QUIZ_OPTION_COUNT = 3

type AnswerValue = string | boolean | number

/**
 * The runtime reads its key from `window.correctAnswers` (assigned in an inline
 * script) or from `data-correct-answers` on the section. Accept either, so a
 * page hand-edited into the attribute form still recovers. The payload is only
 * ever parsed as JSON data; no imported script is executed or kept.
 */
function readAnswerKeyAs<T extends AnswerValue>(
  html: string,
  sectionId: string,
  accepts: (value: unknown) => value is T,
): Record<string, T> | null {
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
    const parsed = answerKeyOf(parseAnswerJson(fromAttribute), accepts)
    if (parsed) return parsed
  }

  // `JSON.parse('…')` keeps the payload in a quoted JS string, so the match has
  // to respect the quote style the exporter used rather than scanning to the
  // first brace-close.
  const script = html.match(
    /correctAnswers\s*=\s*JSON\.parse\(\s*(['"])([\s\S]*?)\1\s*\)/,
  )
  if (script) {
    const parsed = answerKeyOf(parseAnswerJson(script[2].replace(/\\(['"\\])/g, "$1")), accepts)
    if (parsed) return parsed
  }
  return null
}

function parseAnswerJson(raw: string): Record<string, unknown> | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function answerKeyOf<T extends AnswerValue>(
  payload: Record<string, unknown> | null,
  accepts: (value: unknown) => value is T,
): Record<string, T> | null {
  if (!payload) return null
  const key: Record<string, T> = {}
  for (const [id, value] of Object.entries(payload)) {
    if (!accepts(value)) return null
    key[id] = value
  }
  return key
}

function readAnswerKey(html: string, sectionId: string): Record<string, boolean> | null {
  return readAnswerKeyAs(html, sectionId, (value): value is boolean => typeof value === "boolean")
}

/**
 * The grading key of an exported standard activity, in the shape the storyboard
 * stores as `activityAnswers`. Null when the page carries none, or when any
 * value is not a plain string, number or boolean.
 */
export function recoverImportedActivityAnswers(
  html: string,
  sectionId: string,
): Record<string, AnswerValue> | null {
  const key = readAnswerKeyAs(
    html,
    sectionId,
    (value): value is AnswerValue => typeof value === "string"
      || typeof value === "boolean"
      || (typeof value === "number" && Number.isFinite(value)),
  )
  return key && Object.keys(key).length > 0 ? key : null
}

/**
 * The exported option ids in option order. The answer key lists them in that
 * order; positional ids (`qz002_o0`) are also sorted by their index, and a
 * stable id (`qz002_o_<uuid>`) keeps its place in the key.
 */
function exportedOptionIds(sectionId: string, keys: string[]): string[] | null {
  if (keys.length !== QUIZ_OPTION_COUNT) return null
  const prefix = `${sectionId}_o`
  const suffixes = keys.map((key) => (key.startsWith(prefix) ? key.slice(prefix.length) : ""))
  const canonicalQuiz = /^qz\d+$/.test(sectionId)
  if (suffixes.every((suffix) => /^\d+$/.test(suffix))) {
    const sorted = [...keys].sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)))
    return canonicalQuiz || sorted.every((key, index) => key === `${prefix}${index}`) ? sorted : null
  }
  if (!canonicalQuiz) return null
  return suffixes.every((suffix) => /^\d+$/.test(suffix) || /^_[a-f0-9-]{36}$/.test(suffix)) ? keys : null
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

  const optionIds = exportedOptionIds(sectionId, Object.keys(answerKey))
  if (!optionIds) return null

  const options: Array<{ text: string; explanation: string; optionId?: string }> = []
  const correct: number[] = []
  optionIds.forEach((optionId, index) => {
    const text = texts[optionId]?.trim()
    if (!text) return
    if (answerKey[optionId]) correct.push(index)
    options.push({
      text,
      explanation: texts[`${optionId}_exp`]?.trim() ?? "",
      ...(optionId !== `${sectionId}_o${index}` ? { optionId } : {}),
    })
  })
  if (options.length !== QUIZ_OPTION_COUNT) return null
  // An extra flagged option means the key describes a different question shape
  // (multi-select, say) than the three-option quiz entity can hold.
  if (correct.length !== 1) return null

  return { sectionId, question, options, answerIndex: correct[0] }
}
