import { useSyncExternalStore } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

/**
 * How the assistant looks, and so what it's called: the user picks it (click the assistant), and
 * it's kept in this browser. The lab sets it too, to compare the looks.
 */
export const LOOKS = ["orb", "wizard", "buddy", "bot"] as const
export type AssistantLookId = (typeof LOOKS)[number]
export const COLORS = ["blue", "violet", "teal", "amber", "rose"] as const
export type AssistantColor = (typeof COLORS)[number]
export type AssistantStyle = { look: AssistantLookId; color: AssistantColor }

export const LOOK_NAME: Record<AssistantLookId, MessageDescriptor> = {
  orb: msg`ADT Assistant`,
  wizard: msg`ADT Wizard`,
  buddy: msg`ADT Buddy`,
  bot: msg`ADT Bot`,
}
export const COLOR_NAME: Record<AssistantColor, MessageDescriptor> = {
  blue: msg`Blue`,
  violet: msg`Violet`,
  teal: msg`Teal`,
  amber: msg`Amber`,
  rose: msg`Rose`,
}

const KEY = "add-book:assistant"
const DEFAULT: AssistantStyle = { look: "orb", color: "blue" }
const listeners = new Set<() => void>()
let cache: AssistantStyle | null = null

function read(): AssistantStyle {
  if (cache) return cache
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AssistantStyle> | null
    cache = {
      look: LOOKS.includes(raw?.look as AssistantLookId) ? (raw!.look as AssistantLookId) : DEFAULT.look,
      color: COLORS.includes(raw?.color as AssistantColor) ? (raw!.color as AssistantColor) : DEFAULT.color,
    }
  } catch {
    cache = DEFAULT
  }
  return cache
}

export function setAssistantStyle(patch: Partial<AssistantStyle>) {
  cache = { ...read(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage blocked: the look lasts until reload */
  }
  for (const l of listeners) l()
}

export function useAssistantStyle(): AssistantStyle {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read,
    () => DEFAULT,
  )
}
