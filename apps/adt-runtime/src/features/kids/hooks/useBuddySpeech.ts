import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useRef } from "react"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import type { BuddyLine } from "@/features/kids/lib/buddy-lines"
import { playBuddyLineToEnd } from "@/features/kids/lib/buddy-voice"
import { buddySpeechAtom, kidsBuddyAtom } from "@/features/kids/state/kids.atoms"

const SPEECH_DURATION_MS = 6_000

/**
 * Single entry point for "the buddy says X": shows the speech bubble text
 * and plays the line's voice clip when the book ships one (silent otherwise).
 *
 * Returns a promise that settles when the buddy has stopped talking, so a
 * caller can sequence something after the line instead of over it. Callers that
 * do not care can ignore it — it never rejects, and resolves immediately when
 * the book has no clip for the line.
 */
export function useBuddySpeech() {
  const { tk } = useKidsTranslation()
  const setSpeech = useSetAtom(buddySpeechAtom)
  const buddy = useAtomValue(kidsBuddyAtom)
  const language = useAtomValue(currentLanguageAtom)
  const timeoutRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current === null) return
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const say = useCallback(
    (
      line: BuddyLine,
      vars: Record<string, string> = {},
      opts: { language?: string } = {},
    ) => {
      clearTimer()
      setSpeech(tk(line.key, line.fallback, vars))
      const spoken = playBuddyLineToEnd(
        opts.language ?? language,
        buddy.character,
        line.voiceKey ?? line.key,
      )
      timeoutRef.current = window.setTimeout(() => {
        setSpeech(null)
        timeoutRef.current = null
      }, SPEECH_DURATION_MS)
      return spoken
    },
    [buddy.character, clearTimer, language, setSpeech, tk],
  )

  useEffect(() => clearTimer, [clearTimer])

  return { say }
}
