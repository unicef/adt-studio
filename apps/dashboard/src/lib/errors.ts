const ERROR_TYPES: [RegExp, string][] = [
  [/learner response prompt/i, "Missing response controls"],
  [/<label[^>]*> contains no <input/i, "Option label without input"],
  [/data-id order does not match/i, "data-id order mismatch"],
  [/Text node outside any data-id/i, "Text outside data-id"],
  [/must be rendered inside a semantic/i, "Heading outside <h1>–<h6>"],
  [/Text mismatch for data-id/i, "Text mismatch in data-id"],
  [/Heading role .* must use/i, "Wrong heading class"],
  [/font-size utility|page-local font/i, "Forbidden typography"],
  [/missing from the page tree/i, "Outline heading missing"],
  [/^sections\[|schema-valid JSON/i, "Section tree off schema"],
  [/aborted due to timeout|timed out|timeout/i, "Timeout"],
  [/Expected exactly one <section>/i, "More than one <section>"],
]

export const isTimeout = (message: string) => /aborted due to timeout|timed out|timeout/i.test(message)

export function errorType(message: string): string {
  const known = ERROR_TYPES.find(([pattern]) => pattern.test(message))
  if (known) return known[1]
  return message
    .replace(/"[^"]*"/g, "\"…\"")
    .replace(/\d+/g, "N")
    .slice(0, 80)
}
