import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"

export interface ProblemPage {
  pageId: string
  pageNumber: number
}

export type ProblemLevel = "blocked" | "temporary" | "partial"

export interface DescribedProblem {
  level: ProblemLevel
  fix: "pdf" | "key" | "retry"
  title: string
  body: string
  details: string | null
  pages: ProblemPage[]
}

const PAGE_ID = /\bpg\d{3,}\b/g

export function useDescribeProblem() {
  const { t } = useLingui()
  return (stage: "extract" | "sectioning", raw: string | null | undefined, known: readonly ProblemPage[] = []): DescribedProblem => {
    const details = raw?.trim() || null
    const text = details ?? ""
    const ids = [...new Set(text.match(PAGE_ID) ?? [])]
    const pages = [
      ...new Set(
        ids
          .map((id) => known.find((page) => page.pageId === id || (page.pageId.slice(2).match(/\d{3}/g) ?? ([] as string[])).includes(id.slice(2))))
          .filter((page): page is ProblemPage => !!page),
      ),
    ]

    if (/\b429\b|rate.?limit|too many requests/i.test(text)) {
      return {
        level: "temporary",
        fix: "retry",
        title: t`The AI service is busy`,
        body: t`It got too many requests in a short time. Wait a minute, then try again.`,
        details,
        pages: [],
      }
    }
    if (/password/i.test(text)) {
      return {
        level: "blocked",
        fix: "pdf",
        title: t`This PDF is password-protected`,
        body: t`Remove the password from the PDF, then add the book again.`,
        details,
        pages: [],
      }
    }
    if (/\b401\b|unauthori[sz]ed|invalid.{0,20}(api )?key|incorrect api key/i.test(text)) {
      return {
        level: "blocked",
        fix: "key",
        title: t`The AI key was rejected`,
        body: t`Check the key in AI access, then run again.`,
        details,
        pages: [],
      }
    }
    if (ids.length > 0) {
      const numbers = pages.map((page) => page.pageNumber).join(", ")
      return {
        level: "partial",
        fix: "retry",
        title: t`${plural(ids.length, { one: "# page couldn't be processed", other: "# pages couldn't be processed" })}`,
        body: numbers
          ? t`Something on page ${numbers} couldn't be read. Every other page is fine, so you can keep going and fix this later.`
          : t`Some pages couldn't be read. Every other page is fine, so you can keep going and fix this later.`,
        details,
        pages,
      }
    }
    return {
      level: "blocked",
      fix: "retry",
      title: stage === "extract" ? t`Extraction failed` : t`Sectioning failed`,
      body: t`Something went wrong. Try again, and open the details if it keeps happening.`,
      details,
      pages: [],
    }
  }
}
