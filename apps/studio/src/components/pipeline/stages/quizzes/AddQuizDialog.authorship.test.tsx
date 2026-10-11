// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"

const join = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: join }) }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
const { pages } = vi.hoisted(() => ({ pages: [{ pageId: "pg001", pageNumber: 1, hasRendering: true }] }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: pages }), usePageImage: () => ({}) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("@/api/client", () => ({ api: { getQuizzes: vi.fn(), generateQuiz: vi.fn() } }))
const { api } = await import("@/api/client")
const { AddQuizDialog } = await import("./AddQuizDialog")
afterEach(() => { cleanup(); vi.clearAllMocks() })

it("keeps replacement bound to the protected quiz shown before a background refresh", async () => {
  const quiz = { quizId: "qz001", quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"], question: "Original hand edit", source: "manual" as const, options: [], answerIndex: 0, reasoning: "" }
  const response = { version: 2, quizzes: { generatedAt: "fixture", language: "en", pagesPerQuiz: 1, quizzes: [quiz] } }
  vi.mocked(api.getQuizzes).mockResolvedValue(response)
  vi.mocked(api.generateQuiz).mockRejectedValue(new Error("Stop after capturing request"))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><AddQuizDialog open bookLabel="book" onOpenChange={() => {}} /></QueryClientProvider>)
  await waitFor(() => expect(client.getQueryState(["books", "book", "quizzes"])?.status).toBe("success"))
  fireEvent.click(screen.getByRole("button", { name: "Use page 1 for the quiz" }))
  fireEvent.click(await screen.findByRole("radio", { name: "Replace", exact: true }))
  expect(screen.getByText(/qz001: Original hand edit/)).toBeTruthy()
  await act(async () => {
    client.setQueryData(["books", "book", "quizzes"], { ...response, version: 3, quizzes: { ...response.quizzes, quizzes: [{ ...quiz, question: "New concurrent edit" }] } })
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(api.generateQuiz).toHaveBeenCalled())
  expect(api.generateQuiz).toHaveBeenCalledWith("book", "", expect.objectContaining({ baseVersion: 2, replaceQuizIds: ["qz001"] }), expect.anything())
  view.unmount()
  client.clear()
})
