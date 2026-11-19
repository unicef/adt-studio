// @vitest-environment jsdom
import React, { createContext, useContext, useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { QuizzesResponse } from "@/api/client"

// Follow QuizzesView.history.test.tsx: exercise the real editor with a query
// provider and mock only its surrounding services, header and auxiliary UI.
const join = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")

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
vi.mock("./QuizzesLandingPage", () => ({ QuizzesLandingPage: () => null }))
vi.mock("../../components/PageLightbox", () => ({ PageLightbox: () => null }))
vi.mock("@/api/client", async (original) => ({
  ...await original<typeof import("@/api/client")>(),
  api: { getQuizzes: vi.fn(), getVersionHistory: vi.fn() },
}))

const { api } = await import("@/api/client")
const { QuizzesIndex } = await import("./QuizzesIndex")

const response: QuizzesResponse = {
  version: 1,
  historyVersion: 1,
  quizzes: {
    generatedAt: "2026-01-01T00:00:00.000Z",
    language: "en",
    pagesPerQuiz: 1,
    quizzes: ["pg001", "pg002"].map((pageId, quizIndex) => ({
      quizId: `qz${String(quizIndex + 1).padStart(3, "0")}`,
      quizIndex,
      afterPageId: pageId,
      pageIds: [pageId],
      question: `Question for ${pageId}`,
      options: ["A", "B", "C"].map((text) => ({ text, explanation: "Explanation" })),
      answerIndex: 0,
      reasoning: "Reason",
    })),
  },
}

let client: QueryClient

function Harness({ pageId, onSelectPage }: { pageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const [extra, setExtra] = useState<ReactNode>(null)
  return <HeaderContext.Provider value={{ setExtra }}>
    <header>{extra}</header>
    <QuizzesIndex bookLabel="book" selectedPageId={pageId} onSelectPage={onSelectPage} />
  </HeaderContext.Provider>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  })
  vi.mocked(api.getQuizzes).mockResolvedValue(response)
  vi.mocked(api.getVersionHistory).mockResolvedValue({ versions: [] })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["books", "book", "quizzes"], response)
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.unstubAllGlobals()
})

describe("#863: clearing the quizzes page filter", () => {
  it.each(["pg001", "pg003"])("hides Show all quizzes without a callback for page %s", async (pageId) => {
    render(<QueryClientProvider client={client}>
      <Harness pageId={pageId} />
    </QueryClientProvider>)

    if (pageId === "pg001") {
      expect(await screen.findByDisplayValue("Question for pg001")).toBeTruthy()
    } else {
      expect(await screen.findByText("No quizzes for this page")).toBeTruthy()
    }
    expect(screen.queryByRole("button", { name: "Show all quizzes", exact: true })).toBeNull()
  })

  it("shows all quizzes after clearing a page filter", async () => {
    function FilteredQuizzes() {
      const [pageId, setPageId] = useState<string | null>("pg001")
      return <Harness pageId={pageId ?? undefined} onSelectPage={setPageId} />
    }
    render(<QueryClientProvider client={client}><FilteredQuizzes /></QueryClientProvider>)

    expect(await screen.findByDisplayValue("Question for pg001")).toBeTruthy()
    expect(screen.queryByDisplayValue("Question for pg002")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show all quizzes", exact: true }))
    expect(await screen.findByDisplayValue("Question for pg002")).toBeTruthy()
    expect(screen.getByDisplayValue("Question for pg001")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Show all quizzes", exact: true })).toBeNull()
  })

  it.each([
    { pageId: "pg003", scope: "a page without quizzes", hasVisibleQuiz: false },
    { pageId: "pg001", scope: "a page showing only one of the two quizzes", hasVisibleQuiz: true },
  ])("offers Show all quizzes on $scope and requests clearing the page selection", async ({ pageId, hasVisibleQuiz }) => {
    const onSelectPage = vi.fn<(pageId: string | null) => void>()
    render(<QueryClientProvider client={client}>
      <Harness pageId={pageId} onSelectPage={onSelectPage} />
    </QueryClientProvider>)

    if (hasVisibleQuiz) {
      expect(await screen.findByDisplayValue("Question for pg001")).toBeTruthy()
    } else {
      expect(await screen.findByText("No quizzes for this page")).toBeTruthy()
      expect(screen.queryByDisplayValue("Question for pg001")).toBeNull()
    }
    expect(screen.queryByDisplayValue("Question for pg002")).toBeNull()
    expect(onSelectPage).not.toHaveBeenCalled()

    // Lingui mocks expose the English source for “Ver todos os quizzes”.
    const showAllButton = await screen.findByRole("button", { name: "Show all quizzes", exact: true })
    const container = hasVisibleQuiz
      ? screen.getByPlaceholderText("Search questions or options…").parentElement?.parentElement
      : screen.getByText("No quizzes for this page").parentElement
    expect(container?.contains(showAllButton)).toBe(true)
    fireEvent.click(showAllButton)
    expect(onSelectPage).toHaveBeenCalledExactlyOnceWith(null)
  })

  it("keeps Show all quizzes in the list toolbar when text search has no results", async () => {
    const onSelectPage = vi.fn<(pageId: string | null) => void>()
    render(<QueryClientProvider client={client}>
      <Harness pageId="pg001" onSelectPage={onSelectPage} />
    </QueryClientProvider>)

    expect(await screen.findByDisplayValue("Question for pg001")).toBeTruthy()
    const search = screen.getByPlaceholderText("Search questions or options…")
    fireEvent.change(search, { target: { value: "unmatched search term" } })
    expect(screen.queryByDisplayValue("Question for pg001")).toBeNull()
    expect(screen.queryByDisplayValue("Question for pg002")).toBeNull()
    expect(screen.queryByText("No quizzes for this page")).toBeNull()

    const showAllButton = screen.getByRole("button", { name: "Show all quizzes", exact: true })
    expect(search.parentElement?.parentElement?.contains(showAllButton)).toBe(true)
    expect(onSelectPage).not.toHaveBeenCalled()
    fireEvent.click(showAllButton)
    expect(onSelectPage).toHaveBeenCalledExactlyOnceWith(null)
  })

  it("hides Show all quizzes when no page is selected, including after an empty text search", async () => {
    const onSelectPage = vi.fn<(pageId: string | null) => void>()
    render(<QueryClientProvider client={client}>
      <Harness onSelectPage={onSelectPage} />
    </QueryClientProvider>)

    expect(await screen.findByDisplayValue("Question for pg001")).toBeTruthy()
    expect(screen.getByDisplayValue("Question for pg002")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Show all quizzes", exact: true })).toBeNull()

    fireEvent.change(screen.getByPlaceholderText("Search questions or options…"), {
      target: { value: "unmatched search term" },
    })
    expect(screen.queryByDisplayValue("Question for pg001")).toBeNull()
    expect(screen.queryByDisplayValue("Question for pg002")).toBeNull()
    expect(screen.queryByRole("button", { name: "Show all quizzes", exact: true })).toBeNull()
    expect(onSelectPage).not.toHaveBeenCalled()
  })
})
