// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/use-stage-status", () => ({
  useStageStatus: () => ({ isCompleted: true, isRunning: false }),
}))
vi.mock("./SpeechLandingPage", () => ({
  SpeechLandingPage: ({ embedded }: { embedded?: boolean }) => (
    <div>{embedded ? "Embedded speech setup" : "Speech setup"}</div>
  ),
}))
vi.mock("./SpeechView", () => ({
  SpeechView: ({
    embedded,
    onConfigureSpeech,
  }: {
    embedded?: boolean
    onConfigureSpeech?: () => void
  }) => (
    <div>
      <span>{embedded ? "Embedded generated speech" : "Generated speech"}</span>
      {onConfigureSpeech ? (
        <button type="button" onClick={onConfigureSpeech}>Choose Provider</button>
      ) : null}
    </div>
  ),
}))

const { SpeechIndex } = await import("./SpeechIndex")

afterEach(cleanup)

describe("SpeechIndex embedded flow", () => {
  it("keeps completed recovery sessions contained while reopening shared provider setup", () => {
    render(<SpeechIndex bookLabel="recovered-book" embedded />)
    expect(screen.getByText("Embedded generated speech")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Choose Provider" }))
    expect(screen.getByText("Embedded speech setup")).toBeTruthy()
  })
})
