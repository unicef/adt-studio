// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const { state } = vi.hoisted(() => ({ state: { data: null as { items: { id: string; word: string }[] } | null } }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isCompleted: false, isRunning: false }) }))
vi.mock("@/hooks/use-glossary", () => ({ useGlossary: () => ({ data: state.data }) }))
vi.mock("./GlossaryView", () => ({ GlossaryView: () => <div>Retained glossary editor</div> }))
vi.mock("./GlossaryLandingPage", () => ({ GlossaryLandingPage: () => <div>Generate glossary</div> }))
import { GlossaryIndex } from "./GlossaryIndex"

afterEach(cleanup)
it.each(["missing", "empty", "retained"])("routes an idle glossary by saved row existence (%s)", (mode) => {
  const retained = mode !== "missing"
  state.data = retained ? { items: mode === "empty" ? [] : [{ id: "gl001", word: "Root" }] } : null
  render(<GlossaryIndex bookLabel="book" />)
  expect(screen.queryByText("Retained glossary editor") !== null).toBe(retained)
  expect(screen.queryByText("Generate glossary") !== null).toBe(!retained)
})
