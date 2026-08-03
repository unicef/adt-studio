import { parseDocument, DomUtils } from "htmlparser2"

export function extractTextFromHtml(html: string): string {
  const doc = parseDocument(html)
  return DomUtils.textContent(doc).replace(/\s+/g, " ").trim()
}

/** Exclude publishing and institutional matter that is not lesson content. */
export function isInstitutionalEndMatter(html: string): boolean {
  const text = extractTextFromHtml(html.replace(/></g, "> <")).toLowerCase()
  if (!text) return true
  if (/\b(copyright|all rights reserved|isbn|published by)\b/i.test(text)) return true
  return /^(vision|mission)\b/i.test(text)
    && /\b(society|government|national happiness|gnh|bhutanese values|ministry)\b/i.test(text)
}
