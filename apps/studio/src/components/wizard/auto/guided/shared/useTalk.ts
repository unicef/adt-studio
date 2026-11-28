import { useLayoutEffect, useState } from "react"
import { motionOff } from "./motion"

/** How long the assistant talks when it says something new. */
const TALK_MS = 900

/**
 * The assistant says its message: when `key` changes the words show at once, and the assistant
 * talks for a moment (`talking`), so it feels alive without making anyone wait for the text.
 * Still with reduced motion.
 */
export function useTalk(key: string): boolean {
  const [talking, setTalking] = useState(false)
  useLayoutEffect(() => {
    if (motionOff()) return
    setTalking(true)
    const id = window.setTimeout(() => setTalking(false), TALK_MS)
    return () => {
      window.clearTimeout(id)
      setTalking(false)
    }
  }, [key])
  return talking
}
