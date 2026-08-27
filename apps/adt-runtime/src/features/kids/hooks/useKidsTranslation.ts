/**
 * useKidsTranslation — Kids Mode translator with inline English fallbacks.
 *
 * Mirrors `useTranslation()` while delegating fallback handling to the pure
 * kids translator so non-React code can reuse the same behavior.
 */
import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { kidsTranslate } from "@/features/kids/lib/kids-translate"

export function useKidsTranslation() {
  const dict = useAtomValue(translationsAtom)
  const tk = useCallback(
    (key: string, fallback: string, vars: Record<string, string> = {}) =>
      kidsTranslate(dict, key, fallback, vars),
    [dict],
  )
  return { tk }
}
