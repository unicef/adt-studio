import { z } from "zod"
import { ValidationNavigationContext } from "@adt/types"

const optionalSearchString = z.preprocess(
  (value) => typeof value === "string" && value.length > 0 ? value : undefined,
  z.string().optional(),
)

export const BookStepSearch = z.object({
  tab: optionalSearchString,
  previewHref: optionalSearchString,
  sectionId: optionalSearchString,
  validationContext: ValidationNavigationContext.optional().catch(undefined),
  validationReturn: ValidationNavigationContext.optional().catch(undefined),
}).passthrough()
export type BookStepSearch = z.infer<typeof BookStepSearch>

export function parseBookStepSearch(search: Record<string, unknown>): BookStepSearch {
  return BookStepSearch.parse(search)
}
