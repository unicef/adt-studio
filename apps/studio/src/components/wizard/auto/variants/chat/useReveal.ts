import { useCallback, useEffect, useState } from "react"
import { useReducedEffects } from "@/lib/effects"

export const SEEN_KEY = "adt.add-book.chat-seen"

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1"
  } catch {
    return false
  }
}

/** How long the assistant "types" a message: like a person the first time, quick once you know it, none with Reduce effects. */
function pace(len: number, firstTime: boolean, reduced: boolean) {
  if (reduced) return 0
  if (!firstTime) return 180
  return Math.min(1500, 380 + len * 15)
}

export type Revealable = { id: string; from: "ai" | "user"; len: number }

/**
 * Shows a conversation one message at a time. Messages are derived from state, so ids must be
 * stable: a message seen once stays shown even when its content updates (an earlier answer changed).
 * The first message not seen yet "types" for a moment; user messages show at once. `flush` shows
 * everything (Skip to settings). Returns how many messages are visible and whether the assistant is typing.
 */
export function useReveal(messages: Revealable[]) {
  const reduced = useReducedEffects()
  const [firstTime] = useState(() => !readSeen())
  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  const [rush, setRush] = useState(false)
  const index = messages.findIndex((m) => !seen.has(m.id))
  const next = index === -1 ? null : messages[index]

  useEffect(() => {
    if (!next) {
      if (rush) setRush(false)
      return
    }
    const all = rush || reduced
    const delay = next.from === "user" || all ? 0 : pace(next.len, firstTime, reduced)
    const mark = () =>
      setSeen((s) => {
        const out = new Set(s)
        // Without a typing pause, everything that's waiting shows in one go.
        if (all) messages.forEach((m) => out.add(m.id))
        else out.add(next.id)
        return out
      })
    if (delay === 0) return mark()
    const id = window.setTimeout(mark, delay)
    return () => window.clearTimeout(id)
  }, [next?.id, reduced, rush, messages.length])

  /** Shows everything there is, and whatever the same action adds, without typing pauses. */
  const flush = useCallback(() => setRush(true), [])
  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1")
    } catch {
      /* private window: it just plays again next time */
    }
  }, [])

  return { visible: index === -1 ? messages.length : index, typing: next?.from === "ai", flush, markSeen, firstTime }
}
