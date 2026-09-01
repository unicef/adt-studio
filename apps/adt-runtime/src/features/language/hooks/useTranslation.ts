/**
 * useTranslation — hook wrapping the legacy `translateText(key, vars)` helper.
 * Returns a memoized translator that recomputes only when the translations
 * atom changes, so consumers can call `t("key")` freely in render.
 */
import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { translationsAtom } from "@/features/language/state/language.atoms"

export function useTranslation() {
  const dict = useAtomValue(translationsAtom)
  const t = useCallback(
    /**
     * `fallback` is the wording to show when this locale's catalogue has no
     * entry for `key`. Without it a missing key renders as the key itself,
     * which is a useful signal in development but ships raw ids like
     * `narrator-voice-label` to readers. Callers that pass one get readable
     * English instead; callers that don't keep the key-echo behaviour.
     */
    (key: string, variables: Record<string, string> = {}, fallback?: string) => {
      const template = dict[key] || fallback
      if (!template) return key
      return template.replace(/\$\{(.*?)\}/g, (_, name) => variables[name] ?? "")
    },
    [dict],
  )
  return { t, translations: dict }
}
