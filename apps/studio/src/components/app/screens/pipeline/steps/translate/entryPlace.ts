export type EntryPlace =
  | { kind: "page-text"; pageId: string }
  | { kind: "image"; pageId: string }
  | { kind: "easy-read"; pageId: string }
  | { kind: "answer"; pageId: string | null }
  | { kind: "quiz-question"; quiz: number }
  | { kind: "quiz-option"; quiz: number; option: number }
  | { kind: "quiz-explanation"; quiz: number; option: number }
  | { kind: "glossary-term"; termId: string }
  | { kind: "glossary-definition"; termId: string }
  | { kind: "other" }

const EASY_READ_RE = /^(pg\d+)_.*_easy_read$/
const ANSWER_RE = /^(.*?)_ans_/
const IMAGE_RE = /^(pg\d+)_.*im\d{3}/
const PAGE_RE = /^(pg\d+)_/
const QUIZ_QUESTION_RE = /^qz(\d+)_que$/
const QUIZ_EXPLANATION_RE = /^qz(\d+)_o(\d+)_exp$/
const QUIZ_OPTION_RE = /^qz(\d+)_o(\d+)$/
const GLOSSARY_DEFINITION_RE = /^(gl(?:\d{3}|_manual_.+?))_def$/
const GLOSSARY_TERM_RE = /^gl(?:\d{3}|_manual_)/

export function entryPlace(id: string): EntryPlace {
  let match = EASY_READ_RE.exec(id)
  if (match) return { kind: "easy-read", pageId: match[1] }
  match = ANSWER_RE.exec(id)
  if (match) return { kind: "answer", pageId: PAGE_RE.exec(`${match[1]}_`)?.[1] ?? null }
  match = IMAGE_RE.exec(id)
  if (match) return { kind: "image", pageId: match[1] }
  match = PAGE_RE.exec(id)
  if (match) return { kind: "page-text", pageId: match[1] }
  match = QUIZ_QUESTION_RE.exec(id)
  if (match) return { kind: "quiz-question", quiz: Number(match[1]) }
  match = QUIZ_EXPLANATION_RE.exec(id)
  if (match) return { kind: "quiz-explanation", quiz: Number(match[1]), option: Number(match[2]) }
  match = QUIZ_OPTION_RE.exec(id)
  if (match) return { kind: "quiz-option", quiz: Number(match[1]), option: Number(match[2]) }
  match = GLOSSARY_DEFINITION_RE.exec(id)
  if (match) return { kind: "glossary-definition", termId: match[1] }
  if (GLOSSARY_TERM_RE.test(id)) return { kind: "glossary-term", termId: id }
  return { kind: "other" }
}
