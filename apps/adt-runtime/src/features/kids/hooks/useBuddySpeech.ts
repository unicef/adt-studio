import { useSetAtom } from "jotai"
import { useCallback, useEffect, useRef } from "react"
import { buddySpeechAtom } from "@/features/kids/state/kids.atoms"

const SPEECH_DURATION_MS = 6_000

export function useBuddySpeech() {
  const setSpeech = useSetAtom(buddySpeechAtom)
  const timeoutRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current === null) return
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const say = useCallback(
    (text: string) => {
      clearTimer()
      setSpeech(text)
      timeoutRef.current = window.setTimeout(() => {
        setSpeech(null)
        timeoutRef.current = null
      }, SPEECH_DURATION_MS)
    },
    [clearTimer, setSpeech],
  )

  useEffect(() => clearTimer, [clearTimer])

  return { say }
}
