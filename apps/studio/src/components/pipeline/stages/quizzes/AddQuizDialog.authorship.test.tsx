// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const join = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: join }) }))
const runtime = vi.hoisted(() => ({ navigate: vi.fn(), available: true, running: false }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => runtime.navigate }))
const { pages } = vi.hoisted(() => ({ pages: [{ pageId: "pg001", pageNumber: 1, hasRendering: true }] }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: pages }), usePageImage: () => ({}) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "" }), useBookStructuredTextAvailability: () => runtime.available }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: runtime.running }) }))
vi.mock("@/api/client", () => ({ api: { getQuizzes: vi.fn(), generateQuiz: vi.fn() } }))
const { api } = await import("@/api/client")
const { AddQuizDialog } = await import("./AddQuizDialog")
const clients: QueryClient[] = []
beforeEach(() => { vi.resetAllMocks(); runtime.available = true; runtime.running = false })
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.clearAllMocks() })

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


function response(book: string, version = 2) {
  return {
    version,
    quizzes: {
      generatedAt: "fixture", language: "en", pagesPerQuiz: 1,
      quizzes: [{ quizId: "qz001", quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"], question: `Protected ${book} v${version}`, source: "manual" as const, options: [], answerIndex: 0, reasoning: "" }],
    },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
type Generation = Awaited<ReturnType<typeof api.generateQuiz>>
const generated = { quiz: response("result").quizzes.quizzes[0], version: 3 } satisfies Generation

function Host({ bookLabel }: { bookLabel: string }) {
  const [open, setOpen] = React.useState(false)
  return <>
    <button onClick={() => setOpen(true)}>Open quiz dialog</button>
    <AddQuizDialog open={open} onOpenChange={setOpen} bookLabel={bookLabel} />
  </>
}
function setup(book = "A") {
  vi.mocked(api.getQuizzes).mockImplementation(async label => response(label))
  vi.mocked(api.generateQuiz).mockResolvedValue(generated)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  client.setQueryData(["books", "A", "quizzes"], response("A"))
  client.setQueryData(["books", "B", "quizzes"], response("B"))
  const element = (label: string) => <React.StrictMode><QueryClientProvider client={client}><Host bookLabel={label} /></QueryClientProvider></React.StrictMode>
  const view = render(element(book))
  return { client, view, rerender: (label: string) => view.rerender(element(label)) }
}
async function openAndSelectReplace(book = "A", version = 2) {
  fireEvent.click(screen.getByRole("button", { name: "Open quiz dialog" }))
  fireEvent.click(await screen.findByRole("button", { name: "Use page 1 for the quiz" }))
  fireEvent.click(await screen.findByRole("radio", { name: "Replace", exact: true }))
  expect(screen.getByText(`qz001: Protected ${book} v${version}`, { exact: false })).toBeTruthy()
}
async function closeWithEscape() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
}

it("revokes equal-ID/version replacement consent on book changes and does not resurrect it on return", async () => {
  const { rerender } = setup("B")
  await openAndSelectReplace("B")
  rerender("A")
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(api.generateQuiz).not.toHaveBeenCalled()
  rerender("B")
  expect(screen.queryByRole("dialog")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Open quiz dialog" }))
  expect(screen.getByRole("button", { name: "Use page 1 for the quiz" }).getAttribute("aria-pressed")).toBe("false")
  expect(screen.queryByText(/Protected quizzes to replace/)).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Use page 1 for the quiz" }))
  expect((await screen.findByRole("radio", { name: "Add after", exact: true })).getAttribute("aria-checked")).toBe("true")
  fireEvent.click(screen.getByRole("radio", { name: "Replace", exact: true }))
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(api.generateQuiz).toHaveBeenCalledTimes(1))
  expect(api.generateQuiz).toHaveBeenCalledWith("B", "", expect.objectContaining({ baseVersion: 2, replaceQuizIds: ["qz001"] }), expect.anything())
})

it("reopening after cancellation resets selections and replacement while taking the newly saved snapshot", async () => {
  const { client } = setup()
  await openAndSelectReplace()
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  await act(async () => { client.setQueryData(["books", "A", "quizzes"], response("A", 3)) })
  vi.mocked(api.getQuizzes).mockResolvedValue(response("A", 3))
  fireEvent.click(screen.getByRole("button", { name: "Open quiz dialog" }))
  expect(screen.getByRole("button", { name: "Use page 1 for the quiz" }).getAttribute("aria-pressed")).toBe("false")
  fireEvent.click(screen.getByRole("button", { name: "Use page 1 for the quiz" }))
  expect((await screen.findByRole("radio", { name: "Add after", exact: true })).getAttribute("aria-checked")).toBe("true")
  fireEvent.click(screen.getByRole("radio", { name: "Replace", exact: true }))
  expect(screen.getByText(/qz001: Protected A v3/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(api.generateQuiz).toHaveBeenCalledTimes(1))
  expect(api.generateQuiz).toHaveBeenCalledWith("A", "", expect.objectContaining({ baseVersion: 3, replaceQuizIds: ["qz001"] }), expect.anything())
})

it.each(["provider", "running"] as const)("blocks submission when %s availability changes without refreshing frozen consent", async gate => {
  const { client, rerender } = setup()
  await openAndSelectReplace()
  if (gate === "provider") runtime.available = false
  else runtime.running = true
  rerender("A")
  const button = screen.getByRole("button", { name: "Replace protected quizzes" }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.click(button)
  expect(api.generateQuiz).not.toHaveBeenCalled()
  await act(async () => { client.setQueryData(["books", "A", "quizzes"], response("A", 3)) })
  runtime.available = true; runtime.running = false; rerender("A")
  expect(screen.getByText(/qz001: Protected A v2/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(api.generateQuiz).toHaveBeenCalledTimes(1))
  expect(api.generateQuiz).toHaveBeenCalledWith("A", "", expect.objectContaining({ baseVersion: 2 }), expect.anything())
})

for (const destination of ["A", "B"] as const) {
  for (const outcome of ["success", "failure", "refetch"] as const) {
    it(`ignores the old ${outcome} UI completion after Escape/reopen in ${destination === "A" ? "the same" : "another"} book`, async () => {
      const { client, rerender } = setup()
      const request = deferred<Generation>()
      const refetch = deferred<void>()
      vi.mocked(api.generateQuiz).mockReturnValueOnce(request.promise)
      const invalidation = vi.spyOn(client, "invalidateQueries").mockImplementation(async options => {
        if (outcome === "refetch" && options?.queryKey?.[1] === "A" && options.queryKey[2] === "quizzes") await refetch.promise
      })
      await openAndSelectReplace()
      fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
      await waitFor(() => expect(api.generateQuiz).toHaveBeenCalledTimes(1))
      if (outcome === "refetch") {
        await act(async () => { request.resolve(generated) })
        await waitFor(() => expect(invalidation).toHaveBeenCalledWith({ queryKey: ["books", "A", "quizzes"] }))
      }
      await closeWithEscape()
      if (destination === "B") rerender("B")
      await openAndSelectReplace(destination)
      await act(async () => {
        if (outcome === "failure") request.reject(new Error("Old generation failed"))
        else if (outcome === "refetch") refetch.resolve()
        else request.resolve(generated)
        await Promise.resolve()
      })
      expect(screen.getByRole("dialog")).toBeTruthy()
      expect(screen.getByText(`qz001: Protected ${destination} v2`, { exact: false })).toBeTruthy()
      expect(screen.queryByText("Old generation failed")).toBeNull()
      expect(runtime.navigate).not.toHaveBeenCalled()
      expect((screen.getByRole("button", { name: "Replace protected quizzes" }) as HTMLButtonElement).disabled).toBe(false)
      if (outcome !== "failure") {
        expect(invalidation).toHaveBeenCalledWith({ queryKey: ["books", "A", "quizzes"] })
        expect(invalidation.mock.calls.every(([options]) => options?.queryKey?.[1] === "A")).toBe(true)
      }
    })
  }
}

it("an old failed request cannot unlock a newer in-flight replacement", async () => {
  setup()
  const old = deferred<Generation>(), current = deferred<Generation>()
  vi.mocked(api.generateQuiz).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  await openAndSelectReplace()
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(api.generateQuiz).toHaveBeenCalledTimes(1))
  await closeWithEscape()
  await openAndSelectReplace()
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(api.generateQuiz).toHaveBeenCalledTimes(2))
  await act(async () => { old.reject(new Error("Old request failed")) })
  expect((screen.getByRole("button", { name: "Generating…" }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText("Old request failed")).toBeNull()
  expect(runtime.navigate).not.toHaveBeenCalled()
  await act(async () => { current.resolve(generated) })
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(runtime.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/books/$label/$step", params: { label: "A", step: "quizzes" } })
})


it.each([
  ["B", "success"], ["A", "success"], ["B", "failure"], ["A", "failure"],
] as const)("history-like book navigation revokes in-flight completion before reopening %s (%s)", async (destination, outcome) => {
  const { rerender } = setup()
  const request = deferred<Generation>()
  vi.mocked(api.generateQuiz).mockReturnValueOnce(request.promise)
  await openAndSelectReplace()
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(api.generateQuiz).toHaveBeenCalledTimes(1))
  rerender("B")
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  if (destination === "A") rerender("A")
  expect(screen.queryByRole("dialog")).toBeNull()
  await openAndSelectReplace(destination)
  await act(async () => {
    if (outcome === "success") request.resolve(generated)
    else request.reject(new Error("Old scope failed"))
    await Promise.resolve()
  })
  expect(screen.getByRole("dialog")).toBeTruthy()
  expect(screen.getByText(`qz001: Protected ${destination} v2`, { exact: false })).toBeTruthy()
  expect(screen.queryByText("Old scope failed")).toBeNull()
  expect(runtime.navigate).not.toHaveBeenCalled()
  expect(api.generateQuiz).toHaveBeenCalledTimes(1)
})

it("recovers a rejected replacement with a fresh read even while the cached quizzes remain fresh", async () => {
  const { client } = setup()
  client.setDefaultOptions({ queries: { retry: false, staleTime: 5 * 60 * 1000 } })
  let stored = response("A")
  vi.mocked(api.getQuizzes).mockImplementation(async () => stored)
  vi.mocked(api.generateQuiz).mockImplementation(async (_book, _key, body) => {
    if (body.baseVersion !== stored.version) throw new Error("Quiz changed. Review it again.")
    return generated
  })
  await openAndSelectReplace()
  stored = response("A", 3) // Another writer; no artificial query-cache update.
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await screen.findByText("Quiz changed. Review it again.")
  expect(vi.mocked(api.generateQuiz).mock.calls[0][2].baseVersion).toBe(2)
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }))
  await openAndSelectReplace("A", 3)
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(vi.mocked(api.generateQuiz).mock.calls.map(call => call[2].baseVersion)).toEqual([2, 3])
  expect(runtime.navigate).toHaveBeenCalledTimes(1)
})

it("does not authorize from cached data when the opening read fails and recovers on reopen", async () => {
  const { client } = setup()
  client.setDefaultOptions({ queries: { retry: false, staleTime: 5 * 60 * 1000 } })
  vi.mocked(api.getQuizzes).mockRejectedValue(new Error("Unable to read current quizzes"))
  fireEvent.click(screen.getByRole("button", { name: "Open quiz dialog" }))
  fireEvent.click(await screen.findByRole("button", { name: "Use page 1 for the quiz" }))
  await screen.findByText("Unable to read current quizzes")
  expect(screen.queryByText(/Protected A v2/)).toBeNull()
  expect((screen.getByRole("button", { name: "Generate quiz" }) as HTMLButtonElement).disabled).toBe(true)
  expect(api.generateQuiz).not.toHaveBeenCalled()
  await closeWithEscape()
  vi.mocked(api.getQuizzes).mockResolvedValue(response("A", 3))
  await openAndSelectReplace("A", 3)
  expect((screen.getByRole("button", { name: "Replace protected quizzes" }) as HTMLButtonElement).disabled).toBe(false)
})

it("does not capture reverted cache after a cancelled initial read and waits for its replacement", async () => {
  const { client } = setup()
  client.setDefaultOptions({ queries: { retry: false, staleTime: 5 * 60 * 1000 } })
  const abandoned = deferred<ReturnType<typeof response>>(), fresh = deferred<ReturnType<typeof response>>()
  vi.mocked(api.getQuizzes).mockReturnValue(abandoned.promise)
  fireEvent.click(screen.getByRole("button", { name: "Open quiz dialog" }))
  fireEvent.click(await screen.findByRole("button", { name: "Use page 1 for the quiz" }))
  await waitFor(() => expect(api.getQuizzes).toHaveBeenCalled())
  await act(async () => { await client.cancelQueries({ queryKey: ["books", "A", "quizzes"] }) })
  expect(screen.queryByRole("radio", { name: "Replace", exact: true })).toBeNull()
  expect((screen.getByRole("button", { name: "Generate quiz" }) as HTMLButtonElement).disabled).toBe(true)
  vi.mocked(api.getQuizzes).mockReturnValue(fresh.promise)
  let refresh!: Promise<void>
  await act(async () => { refresh = client.refetchQueries({ queryKey: ["books", "A", "quizzes"] }) })
  await act(async () => { abandoned.resolve(response("A")); await Promise.resolve() })
  expect((screen.getByRole("button", { name: "Generate quiz" }) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { fresh.resolve(response("A", 3)); await refresh })
  fireEvent.click(await screen.findByRole("radio", { name: "Replace", exact: true }))
  expect(screen.getByText(/qz001: Protected A v3/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Replace protected quizzes" }))
  await waitFor(() => expect(api.generateQuiz).toHaveBeenCalledTimes(1))
  expect(vi.mocked(api.generateQuiz).mock.calls[0][2].baseVersion).toBe(3)
})
