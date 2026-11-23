// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { PageSummaryItem } from "@/api/client"
import type { ExtractRerunStatus } from "@adt/types"
import { ExtractView } from "./ExtractView"

const state = vi.hoisted(() => ({
  pages: [] as PageSummaryItem[], available: false, ready: true, stage: "error",
  rerun: undefined as ExtractRerunStatus | undefined,
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
  useBookRejectedTextProvider: () => null,
}))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({
  stageState: () => state.stage, stepState: () => "idle", stepProgress: () => undefined,
  stepError: () => undefined, queueRun: state.queueRun, extractRerun: state.rerun,
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
  Object.assign(state, { pages: [], available: false, ready: true, stage: "error", rerun: undefined })
  vi.clearAllMocks()
})
afterEach(cleanup)

const offers = (...actions: ExtractRerunStatus["actions"]): ExtractRerunStatus => ({ actions, attemptId: "7b0e9d4c-52a1-4a43-9c0e-2f6f3f1f8a11", blockedReason: null })

it.each([
  { stage: "idle", rerun: undefined }, { stage: "error", rerun: undefined },
  { stage: "error", rerun: offers("replace") }, { stage: "idle", rerun: offers("retry") },
  { stage: "error", rerun: { actions: [], attemptId: null, blockedReason: "downstream-output" } satisfies ExtractRerunStatus },
])("preserves populated-book extraction protection when provider onboarding is available ($stage, $rerun.actions)", ({ stage, rerun }) => {
  state.stage = stage
  state.rerun = rerun
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

it.each([
  { stage: "error", rerun: offers("resume", "replace") },
  { stage: "idle", rerun: offers("resume") },
  { stage: "idle", rerun: { ...offers("resume", "replace"), attemptId: null } },
])("RAC-24: offers Retry and sends the resume request when Extract can resume ($stage, $rerun.attemptId)", ({ stage, rerun }) => {
  state.stage = stage
  state.rerun = rerun
  state.pages = [{ pageId: "pg001", pageNumber: 1 } as PageSummaryItem]
  const view = render(<ExtractView bookLabel="unfinished" />)
  expect(screen.queryByText("Re-extraction is not available in this version")).toBeNull()
  const run = screen.getByRole("button", { name: /^(Run|Retry) Extract$/ }) as HTMLButtonElement
  // Still needs a provider: the pending steps call a model.
  expect(run.disabled).toBe(true)
  state.available = true
  view.rerender(<ExtractView bookLabel="unfinished" />)
  expect(run.disabled).toBe(false)
  fireEvent.click(run)
  expect(state.queueRun).toHaveBeenCalledExactlyOnceWith({
    fromStage: "extract", toStage: "extract", apiKey: "fixture",
    extraction: { action: "resume", attemptId: rerun.attemptId },
  })
})
