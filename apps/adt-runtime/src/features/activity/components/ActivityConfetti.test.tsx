// @vitest-environment jsdom
import React, { forwardRef, useImperativeHandle } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { confettiTriggerAtom } from "../state/activity.atoms"
import { reduceMotionAtom } from "@/shared/state/ui.atoms"
import { ActivityConfetti } from "./ActivityConfetti"

const state = vi.hoisted(() => ({ fire: vi.fn() }))
vi.mock("@/shared/ui/confetti", () => ({ Confetti: forwardRef((_props, ref) => {
  useImperativeHandle(ref, () => ({ fire: state.fire }))
  return <canvas data-testid="confetti" />
}) }))
const store = getDefaultStore()
let matches = false
let change: () => void
beforeEach(() => {
  state.fire.mockClear()
  matches = false
  store.set(reduceMotionAtom, false)
  store.set(confettiTriggerAtom, 0)
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return matches },
    addEventListener: (_event: string, callback: () => void) => { change = callback },
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("AC-5: honors OS and reader motion preferences without replaying suppressed celebrations", () => {
  matches = true
  render(<ActivityConfetti />)
  act(() => store.set(confettiTriggerAtom, 1))
  expect(state.fire).not.toHaveBeenCalled()
  expect(screen.queryByTestId("confetti")).toBeNull()
  act(() => { matches = false; change() })
  expect(state.fire).not.toHaveBeenCalled()
  act(() => store.set(confettiTriggerAtom, 2))
  expect(state.fire).toHaveBeenCalledTimes(1)
  act(() => store.set(reduceMotionAtom, true))
  expect(screen.queryByTestId("confetti")).toBeNull()
  act(() => store.set(confettiTriggerAtom, 3))
  act(() => store.set(reduceMotionAtom, false))
  expect(state.fire).toHaveBeenCalledTimes(1)
  act(() => { matches = true; change() })
  expect(screen.queryByTestId("confetti")).toBeNull()
})
