// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isCompleted: false, isRunning: false, hasError: false }) }))
vi.mock("../stages/languages/LanguageView", () => ({ LanguageView: () => <p>Saved translations</p> }))
vi.mock("../stages/languages/LanguageLandingPage", () => ({ LanguageLandingPage: () => <p>First run</p> }))
vi.mock("../stages/captions/CaptionsView", () => ({ CaptionsView: () => <p>Saved captions</p> }))
vi.mock("../stages/captions/CaptionsLandingPage", () => ({ CaptionsLandingPage: () => <p>First run</p> }))
vi.mock("../stages/easy-read/EasyReadView", () => ({ EasyReadView: () => <p>Saved easy read</p> }))
vi.mock("../stages/easy-read/EasyReadLandingPage", () => ({ EasyReadLandingPage: () => <p>First run</p> }))
vi.mock("../stages/speech/SpeechView", () => ({ SpeechView: () => <p>Saved speech</p> }))
vi.mock("../stages/speech/SpeechLandingPage", () => ({ SpeechLandingPage: () => <p>First run</p> }))
const { LanguageIndex } = await import("../stages/languages/LanguageIndex")
const { CaptionsIndex } = await import("../stages/captions/CaptionsIndex")
const { EasyReadIndex } = await import("../stages/easy-read/EasyReadIndex")
const { SpeechIndex } = await import("../stages/speech/SpeechIndex")
afterEach(cleanup)

it.each([
  [LanguageIndex, "translation", "Saved translations"],
  [CaptionsIndex, "caption", "Saved captions"],
  [EasyReadIndex, "easy-read", "Saved easy read"],
  [SpeechIndex, "audio", "Saved speech"],
] as const)("keeps the saved editor available when source Save clears job status (%s)", (View, kind, label) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["books", "retained", "outputs", false, undefined], { outputs: [{ identity: { kind, id: "stable" }, usable: true, protected: true, current: false }] })
  render(<QueryClientProvider client={client}><View bookLabel="retained" /></QueryClientProvider>)
  expect(screen.queryByText("First run")).toBeNull()
  expect(screen.getByText(label)).toBeTruthy()
  client.clear()
})
