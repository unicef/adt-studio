/**
 * Ambient buddy chatter: while the child is reading (buddy panel closed, no
 * narration playing, tab visible), the buddy occasionally pipes up on its own
 * with a short, warm, non-task line so it feels alive.
 *
 * Deliberately gentle: a randomized 45-90s gap between lines, never repeating
 * the previous one, paused whenever the reader interacts (opening the panel,
 * starting read-aloud) or leaves the tab. Toggleable via the reading-comfort
 * settings (kidsBuddyChatterAtom).
 */
import { useEffect, useRef } from "react"
import type { BuddyLine } from "@/features/kids/lib/buddy-lines"
import { getIdlePhrases, pickRandomPhrase } from "@/features/kids/lib/buddy-phrases"

const MIN_GAP_MS = 45_000
const MAX_GAP_MS = 90_000

export function useBuddyIdleChatter(opts: {
  say: (line: BuddyLine) => void
  character: string
  /** Only chatters while true (panel closed, chatter on, narration idle). */
  enabled: boolean
}): void {
  const { say, character, enabled } = opts
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    let timer: number

    const schedule = () => {
      const gap = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS)
      timer = window.setTimeout(fire, gap)
    }

    const fire = () => {
      if (document.visibilityState === "visible") {
        const pool = getIdlePhrases(character)
        const previous = lastKeyRef.current
          ? { key: lastKeyRef.current, fallback: "" }
          : null
        const line = pickRandomPhrase(pool, previous)
        lastKeyRef.current = line.key
        say(line)
      }
      schedule()
    }

    schedule()
    return () => window.clearTimeout(timer)
  }, [enabled, character, say])
}
