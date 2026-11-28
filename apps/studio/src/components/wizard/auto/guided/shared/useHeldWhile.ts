import { useState } from "react"

/** `value` while `active`; while not, the last value it had when it was. */
export function useHeldWhile<T>(active: boolean, value: T): T {
  const [held, setHeld] = useState(value)
  if (active && held !== value) setHeld(value)
  return active ? value : held
}
