import type { PresetConfig } from "@/components/wizard/constants"

export function hasAvailableExamples(
  preset: Pick<PresetConfig, "exampleBooks">,
): boolean {
  return preset.exampleBooks.some((book) => !book.comingSoon)
}