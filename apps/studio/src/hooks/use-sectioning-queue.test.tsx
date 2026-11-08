// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PIPELINE } from "@adt/types"
vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getStepStatus: vi.fn(), getStagesStatus: vi.fn(), runStages: vi.fn() } }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ ownCredentials: {} }) }))
vi.mock("@/hooks/use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("@/components/a11y/LiveRegionAnnouncer", () => ({ useAnnouncer: () => ({ announce: vi.fn() }) }))
vi.mock("@/lib/completion-sound", () => ({ playCompletionSound: vi.fn(), playErrorSound: vi.fn() }))
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }))
vi.mock("@lingui/core/macro", () => ({ msg: (s: TemplateStringsArray) => s[0] }))
vi.mock("@lingui/core", () => ({ i18n: { _: () => "event" } }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: (s: TemplateStringsArray) => s[0] }) }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (s: string) => s, getStageRunningLabelI18n: (s: string) => s }))
vi.mock("@/components/parts/PartialMergeNotice", () => ({ PartialMergeNotice: () => null }))
vi.mock("@/components/wizard/shared/PreviewShell", () => ({ PreviewShell: () => null }))
vi.mock("@/hooks/use-downstream-with-output", () => ({ useDownstreamWithOutput: () => [] }))
const { useBookRunStatus, BookRunProvider } = await import("@/hooks/use-book-run")
const { LandingPageShell } = await import("@/components/pipeline/components/LandingPageShell")
const { api } = await import("@/api/client")
class Events {
  static current: Events
  static CLOSED = 2
  readyState = 1
  listeners = new Map<string, ((event: MessageEvent) => void)[]>()
  constructor() { Events.current = this }
  close() { this.listeners.clear() }
  addEventListener(type: string, fn: (event: MessageEvent) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]) }
  emit(type: string, data: unknown) { for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data: JSON.stringify(data) })) }
}

type Status = Awaited<ReturnType<typeof api.getStepStatus>>
const state: Status = { stages: { extract: "running", sectioning: "idle" }, steps: {}, error: null, stepErrors: null, stepMessages: null, pendingDecisions: [], runStatus: "running", runRevision: "extract-job", protectedWork: [] }
function deferred() {
  let resolve!: (value: Status) => void
  const promise = new Promise<Status>(done => { resolve = done })
  return { promise, resolve }
}
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks() })

function SectioningRun({ label }: { label: string }) {
  const run = useBookRunStatus(label)
  const running = ["queued", "running"].includes(run.stageState("sectioning"))
  return <BookRunProvider value={run}><LandingPageShell
    bookLabel={label} stageSlug="sectioning" colorClass="bg-blue-500"
    isRunning={running} isCompleted={false} hasError={false} canRun
    runLabel="Run Sectioning" rerunLabel="Re-run" previewLabel="Preview" preview={null}
    onRun={options => run.queueRun({ fromStage: "sectioning", toStage: "sectioning", apiKey: "", ...options })}
  >{null}</LandingPageShell></BookRunProvider>
}

async function setup() {
  vi.stubGlobal("EventSource", Events)
  vi.mocked(api.getStepStatus).mockResolvedValue(state)
  vi.mocked(api.runStages).mockResolvedValue({ status: "queued", id: "sectioning-job" } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  clients.push(client)
  client.setQueryData(["books", "book", "step-status"], state)
  client.setQueryData(["books", "book", "observed-run-publications"], ["extract-job"])
  const tree = (label: string) => <QueryClientProvider client={client}><SectioningRun label={label} /></QueryClientProvider>
  const view = render(tree("book"))
  await waitFor(() => expect((screen.getByRole("button", { name: "Run Sectioning" }) as HTMLButtonElement).disabled).toBe(false))
  return { client, navigate: (label: string) => view.rerender(tree(label)) }
}
const runButton = () => screen.getByRole("button", { name: "Run Sectioning" }) as HTMLButtonElement
const extractStep = PIPELINE.find(stage => stage.name === "extract")!.steps[0].name

it("keeps Sectioning queueable during a background status fetch and uses its own fresh protection read", async () => {
  const { client } = await setup()
  const background = deferred()
  vi.mocked(api.getStepStatus).mockReturnValueOnce(background.promise)
  let refetch!: Promise<void>
  act(() => { refetch = client.refetchQueries({ queryKey: ["books", "book", "step-status"], exact: true }) })
  await waitFor(() => expect(client.isFetching()).toBe(1))
  // Allow the observer to notify React before checking the visible control.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(runButton().disabled).toBe(false)
  const calls = vi.mocked(api.getStepStatus).mock.calls.length
  fireEvent.click(runButton())
  await waitFor(() => expect(api.runStages).toHaveBeenCalledTimes(1))
  expect(vi.mocked(api.getStepStatus).mock.calls.length).toBeGreaterThan(calls)
  await act(async () => { background.resolve(state); await refetch })
  expect(screen.queryByRole("alert")).toBeNull()
})

it.each(["step-start", "step-progress", "step-complete", "reconnect", "complete"])("queues the first Sectioning click exactly once across Extract %s", async event => {
  const { client } = await setup()
  const confirmation = deferred()
  vi.mocked(api.getStepStatus).mockReturnValueOnce(confirmation.promise)
  fireEvent.click(runButton())
  expect(runButton().disabled).toBe(true)
  // A second click must not create another request while consent is pending.
  fireEvent.click(runButton())
  await act(async () => {
    if (event === "reconnect") Events.current.emit("open", {})
    else if (event === "complete") {
      vi.mocked(api.getStepStatus).mockResolvedValue({ ...state, runRevision: "extract-done", runStatus: "completed", stages: { extract: "done", sectioning: "idle" } })
      Events.current.emit("complete", { label: "book" })
    }
    else Events.current.emit("progress", { type: event, step: extractStep, page: 1, totalPages: 5 })
  })
  if (event === "complete") await waitFor(() => expect(client.getQueryData(["books", "book", "observed-run-publications"])).toContain("extract-done"))
  expect(api.runStages).not.toHaveBeenCalled()
  await act(async () => confirmation.resolve(state))
  await waitFor(() => expect(api.runStages).toHaveBeenCalledTimes(1))
  expect(api.runStages).toHaveBeenCalledWith("book", "", expect.objectContaining({ fromStage: "sectioning", toStage: "sectioning", replaceManual: undefined }), expect.anything())
  expect(screen.queryByRole("alert")).toBeNull()
})

it.each(["failed", "cancelled"])("does not queue from a %s fresh read or warm empty protection cache", async outcome => {
  const { client } = await setup()
  const confirmation = deferred()
  if (outcome === "failed") vi.mocked(api.getStepStatus).mockRejectedValueOnce(new Error("Status unavailable"))
  else vi.mocked(api.getStepStatus).mockReturnValueOnce(confirmation.promise)
  fireEvent.click(runButton())
  if (outcome === "cancelled") {
    await act(async () => { await client.cancelQueries({ queryKey: ["books", "book"] }); confirmation.resolve(state) })
  }
  await screen.findByRole("alert")
  expect(api.runStages).not.toHaveBeenCalled()
  await waitFor(() => expect(runButton().disabled).toBe(false))
  fireEvent.click(runButton())
  await waitFor(() => expect(api.runStages).toHaveBeenCalledTimes(1))
})

it("discards a pending queue click when navigation changes the book", async () => {
  const { navigate } = await setup()
  const confirmation = deferred()
  vi.mocked(api.getStepStatus).mockReturnValueOnce(confirmation.promise)
  fireEvent.click(runButton())
  navigate("other")
  await act(async () => confirmation.resolve(state))
  await waitFor(() => expect(runButton().disabled).toBe(false))
  expect(api.runStages).not.toHaveBeenCalled()
})

it("requires replacement consent for fresh protected work even while the background read says empty", async () => {
  const { client } = await setup()
  const background = deferred()
  vi.mocked(api.getStepStatus).mockReturnValueOnce(background.promise)
  act(() => { void client.refetchQueries({ queryKey: ["books", "book", "step-status"], exact: true }) })
  const record = { node: "page-sectioning" as const, itemId: "pg003", pageNumber: 3, version: 7 }
  vi.mocked(api.getStepStatus).mockResolvedValueOnce({ ...state, protectedWork: [record] })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  fireEvent.click(runButton())
  await screen.findByRole("dialog")
  expect(api.runStages).not.toHaveBeenCalled()
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  await act(async () => background.resolve(state))
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "Re-run" }))
  await waitFor(() => expect(api.runStages).toHaveBeenCalledTimes(1))
  expect(api.runStages).toHaveBeenCalledWith("book", "", expect.objectContaining({ replaceManual: true, protectedReplacements: [{ node: "page-sectioning", itemId: "pg003", version: 7 }] }), expect.anything())
})
