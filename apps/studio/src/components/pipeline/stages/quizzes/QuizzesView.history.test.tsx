// @vitest-environment jsdom
import React, { createContext, useContext, useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { QuizzesResponse } from "@/api/client"

const join = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")

// Vitest does not compile Lingui macros. Production compilation and extraction
// separately verify that these labels reach every locale.
vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: join, i18n: { _: (d: { message: string }) => d.message } }),
}))

const HeaderContext = createContext<{ setExtra: (extra: ReactNode) => void }>({ setExtra: () => {} })
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => useContext(HeaderContext) }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: [] }), usePageImage: () => ({}) }))
vi.mock("@/hooks/use-api-key", () => ({ useBookStructuredTextAvailability: () => false }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("../../components/floating-save", () => ({
  useFloatingSave: () => {},
  PendingChip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock("./components/QuizzesHintBanner", () => ({ QuizzesHintBanner: () => null }))
vi.mock("./components/QuizJumper", () => ({ QuizJumper: () => null }))
vi.mock("./AddQuizDialog", () => ({ AddQuizDialog: () => null }))
vi.mock("../../components/PageLightbox", () => ({ PageLightbox: () => null }))
vi.mock("@/api/client", () => ({ api: { getQuizzes: vi.fn(), getVersionHistory: vi.fn(), restoreVersion: vi.fn() } }))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { api } = await import("@/api/client")
const { toast } = await import("@/components/ui/sonner")
const { QuizzesView } = await import("./QuizzesView")

const output = {
  generatedAt: "2026-01-01T00:00:00.000Z", language: "en", pagesPerQuiz: 1,
  quizzes: [{
    quizId: "qz1000", quizIndex: 0, afterPageId: "pg001", pageIds: [], question: "Retained question",
    options: ["A", "B", "C"].map((text) => ({ text, explanation: "Explanation" })), answerIndex: 0, reasoning: "Reason",
  }],
}
let response: QuizzesResponse
let client: QueryClient

function Harness() {
  const [extra, setExtra] = useState<ReactNode>(null)
  return <HeaderContext.Provider value={{ setExtra }}>
    <header>{extra}</header>
    <QuizzesView bookLabel="book" />
  </HeaderContext.Provider>
}

function renderView() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  })
  response = { quizzes: null, version: null, historyVersion: 2 }
  vi.mocked(api.getQuizzes).mockImplementation(async () => response)
  vi.mocked(api.getVersionHistory).mockResolvedValue({ versions: [
    { version: 2, data: null },
    { version: 1, data: output },
  ] })
  vi.mocked(api.restoreVersion).mockImplementation(async (_book, _step, _item, version) => {
    response = version === 1
      ? { quizzes: output, version: 1, historyVersion: 1 }
      : { quizzes: null, version: null, historyVersion: 2 }
    return { node: "quiz-generation", itemId: "book", version }
  })
})

afterEach(() => {
  cleanup()
  client?.clear()
  vi.unstubAllGlobals()
})

describe("quiz history recovery", () => {
  it("offers retained history while inactive, restores it, and labels a later invalidation", async () => {
    renderView()
    const trigger = await screen.findByRole("button", { name: /^v\s*2\s*Invalidated$/ })
    expect(screen.queryByDisplayValue("Retained question")).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole("button", { name: /^v\s*1/ }))
    await waitFor(() => expect(api.restoreVersion).toHaveBeenCalledWith("book", "quiz-generation", "book", 1))
    expect(await screen.findByDisplayValue("Retained question")).toBeTruthy()
    expect(api.getVersionHistory).toHaveBeenCalledWith("book", "quiz-generation", "book", true, true)

    fireEvent.click(await screen.findByRole("button", { name: /^v\s*1$/ }))
    fireEvent.click(await screen.findByRole("button", { name: /^v\s*2\s*Invalidated/ }))
    expect(await screen.findByRole("button", { name: /^v\s*2\s*Invalidated$/ })).toBeTruthy()
    expect(screen.queryByDisplayValue("Retained question")).toBeNull()
    expect(api.restoreVersion).toHaveBeenLastCalledWith("book", "quiz-generation", "book", 2)
  })

  it("keeps recovery available after a failed restore", async () => {
    vi.mocked(api.restoreVersion).mockRejectedValueOnce(new Error("Restore failed"))
    renderView()
    fireEvent.click(await screen.findByRole("button", { name: /^v\s*2\s*Invalidated$/ }))
    fireEvent.click(await screen.findByRole("button", { name: /^v\s*1/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(await screen.findByRole("button", { name: /^v\s*2\s*Invalidated$/ })).toBeTruthy()
    expect(screen.queryByDisplayValue("Retained question")).toBeNull()
  })

  it("does not invent history for a book that has never generated quizzes", async () => {
    response = { quizzes: null, version: null, historyVersion: null }
    renderView()
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(screen.queryByRole("button", { name: /^v\s*\d/ })).toBeNull()
    expect(api.getVersionHistory).not.toHaveBeenCalled()
  })
})
