// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { PageSummaryItem } from "@/api/client"
import { ExtractView } from "./ExtractView"

const state = vi.hoisted(() => ({
  pages: [] as PageSummaryItem[], available: false, ready: true, stage: "error",
  queueRun: vi.fn(), navigate: vi.fn(), setExtra: vi.fn(), setOnLabelClick: vi.fn(),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((text, part, i) => text + part + (values[i] ?? ""), "") }),
}))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate, Link: () => null }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: state.pages, isLoading: false }), usePageImage: () => ({}) }))
vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({ apiKey: "fixture" }),
  useBookStructuredTextStatus: () => ({ available: state.available, ready: state.ready }),
}))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({
  stageState: () => state.stage, stepState: () => "idle", stepProgress: () => undefined,
  stepError: () => undefined,
    stepMessage: () => undefined, queueRun: state.queueRun,
}) }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ setExtra: state.setExtra, setOnLabelClick: state.setOnLabelClick }) }))
vi.mock("../../pipeline-i18n", () => ({
  getStageLabelI18n: () => "Extract", getStageRunningLabelI18n: () => "Extracting",
  getStageDescriptionI18n: () => "Read the PDF", getStepLabelI18n: (step: string) => step,
}))
vi.mock("./components/ExtractPageDetail", () => ({ ExtractPageDetail: () => null }))
vi.mock("./components/SpreadReview", () => ({ SpreadReview: () => null }))
vi.mock("./BookHeader", () => ({ BookHeader: () => null }))

beforeEach(() => {
  Object.assign(state, { pages: [], available: false, ready: true, stage: "error" })
  vi.clearAllMocks()
})
afterEach(cleanup)

it.each(["idle", "error"])("preserves populated-book extraction protection when provider onboarding is available (%s)", (stage) => {
  state.stage = stage
  state.pages = [{ pageId: "pg001", pageNumber: 1 } as PageSummaryItem]
  const view = render(<ExtractView bookLabel="historical" />)
  expect(screen.getByText("Re-extraction is not available in this version")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Connect provider" }))
  expect(state.navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/settings/providers" }))
  const run = screen.getByRole("button", { name: /^(Run|Retry) Extract$/ }) as HTMLButtonElement
  expect(run.disabled).toBe(true)
  fireEvent.click(run)
  expect(state.queueRun).not.toHaveBeenCalled()

  state.available = true
  view.rerender(<ExtractView bookLabel="historical" />)
  expect(screen.queryByRole("button", { name: "Connect provider" })).toBeNull()
  expect(run.disabled).toBe(true)
  fireEvent.click(run)
  expect(state.queueRun).not.toHaveBeenCalled()
  expect(screen.getByText("Re-extraction is not available in this version")).toBeTruthy()
})

it("offers provider connection only after status is known and retries an empty book once connected", () => {
  state.ready = false
  const view = render(<ExtractView bookLabel="new-book" />)
  expect(screen.queryByText("Connect an AI provider to retry.")).toBeNull()
  expect(screen.queryByRole("button", { name: "Connect provider" })).toBeNull()
  const retry = screen.getByRole("button", { name: "Retry Extract" }) as HTMLButtonElement
  expect(retry.disabled).toBe(true)

  state.ready = true
  view.rerender(<ExtractView bookLabel="new-book" />)
  expect(screen.getByText("Connect an AI provider to retry.")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Connect provider" })).toBeTruthy()
  state.available = true
  view.rerender(<ExtractView bookLabel="new-book" />)
  expect(retry.disabled).toBe(false)
  fireEvent.click(retry)
  expect(state.queueRun).toHaveBeenCalledExactlyOnceWith({ fromStage: "extract", toStage: "extract", apiKey: "fixture" })
})
