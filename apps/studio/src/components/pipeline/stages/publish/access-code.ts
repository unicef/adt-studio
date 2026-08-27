import {
  PUBLICATION_ACCESS_CODE_ALPHABET,
  PUBLICATION_ACCESS_CODE_LENGTH,
  PUBLICATION_ACCESS_CODE_MAX_LENGTH,
  PUBLICATION_ACCESS_CODE_MIN_LENGTH,
} from "@adt/types"

export type AccessChoiceValue = "code" | "open"

/** Default on. A link that opens for anyone who ever sees it is the surprising choice, not
 *  the safe one, so the author has to *ask* for that. */
export const DEFAULT_ACCESS_CHOICE: AccessChoiceValue = "code"

export {
  PUBLICATION_ACCESS_CODE_LENGTH as ACCESS_CODE_LENGTH,
  PUBLICATION_ACCESS_CODE_MAX_LENGTH as ACCESS_CODE_MAX_LENGTH,
  PUBLICATION_ACCESS_CODE_MIN_LENGTH as ACCESS_CODE_MIN_LENGTH,
}

/** `crypto.getRandomValues` rather than `Math.random`: this string is the only thing standing
 *  between a leaked link and the book. Rejection sampling keeps every character equally likely
 *  — a plain modulo would quietly favour the front of the alphabet. */
export function generateAccessCode(length: number = PUBLICATION_ACCESS_CODE_LENGTH): string {
  const alphabet = PUBLICATION_ACCESS_CODE_ALPHABET
  const limit = Math.floor(256 / alphabet.length) * alphabet.length
  let code = ""
  const bytes = new Uint8Array(length * 2)
  while (code.length < length) {
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (code.length === length) break
      if (byte >= limit) continue
      code += alphabet[byte % alphabet.length]
    }
  }
  return code
}

/** What the author may type by hand. Whitespace is stripped rather than rejected: a code
 *  pasted out of a chat message often arrives with a space on it. */
export function normalizeAccessCodeInput(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase()
}

export function isValidAccessCode(value: string): boolean {
  const normalized = normalizeAccessCodeInput(value)
  return (
    normalized.length >= PUBLICATION_ACCESS_CODE_MIN_LENGTH &&
    normalized.length <= PUBLICATION_ACCESS_CODE_MAX_LENGTH
  )
}
