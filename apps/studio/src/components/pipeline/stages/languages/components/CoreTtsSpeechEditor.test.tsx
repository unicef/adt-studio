// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { CoreTtsCatalogEntry } from "@/api/client"

const calls = vi.hoisted(() => ({ speech: vi.fn() }))
const translate = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: translate(strings, ...values) }),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: translate, i18n: { locale: "en", _: (value: { message: string }) => value.message } }),
}))
vi.mock("@/api/client", () => ({
  BASE_URL: "",
  api: {
    updateCoreTtsEntry: calls.speech,
    getOutputs: async () => ({ outputs: [] }),
    getOutputSummary: async () => ({ legacyBaselineRevision: 0, stages: {}, stagesWithoutMissing: {}, missingStages: [] }),
  },
}))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: undefined }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ isRunning: false }) }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (value: string) => value }))

const { CoreTtsSpeechEditor } = await import("./CoreTtsSpeechEditor")
const { FloatingSaveProvider, useFloatingSaveLeaveAction, useFloatingSaveDirtyEntries } = await import("../../../components/floating-save")
const { TooltipProvider } = await import("@/components/ui/tooltip")

let client: QueryClient
let leave: ReturnType<typeof useFloatingSaveLeaveAction>
let dirtyIds: string[] = []

function Probe() {
  leave = useFloatingSaveLeaveAction()
  dirtyIds = useFloatingSaveDirtyEntries().map(entry => entry.id)
  return null
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <FloatingSaveProvider>{children}<Probe /></FloatingSaveProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

function setup(children: React.ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(["books", "book", "outputs", "summary"], {
    legacyBaselineRevision: 0, stages: {}, stagesWithoutMissing: {}, missingStages: [],
  })
  return render(children, { wrapper: Providers })
}

const entry: CoreTtsCatalogEntry = {
  id: "phrase", displayText: "Display", speechText: "Prepared", changed: true,
  transformations: [], status: "ready",
  generation: {
    mode: "manual", generatedAt: "before", enabledTransformations: [],
    sourceTextHash: "text", contextHash: "context",
  },
}
const props = { bookLabel: "book", language: "fr", displayText: entry.displayText, entry, version: 1, sourceSignature: "source" }

type SpeechResult = { version: number; entry: CoreTtsCatalogEntry }
function deferred() {
  let resolve!: (value: SpeechResult) => void
  let reject!: (error: Error) => void
  const promise = new Promise<SpeechResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function edit(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "Edit speech text" }))
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } })
}

beforeEach(() => calls.speech.mockReset())
afterEach(() => { cleanup(); client?.clear() })

it.each(["success", "failure"])("retains a successor after delayed %s and retries against its own acknowledged version", async outcome => {
  const pending = deferred()
  calls.speech.mockReturnValueOnce(pending.promise).mockResolvedValue({ version: 3, entry })
  setup(<CoreTtsSpeechEditor {...props} />)
  edit("Submitted")
  fireEvent.click(screen.getByRole("button", { name: "Save speech text" }))
  expect(calls.speech).toHaveBeenCalledTimes(1)
  await expect(leave.saveAndStay()).rejects.toThrow("still in progress")

  await act(async () => {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Same-batch successor" } })
    if (outcome === "success") pending.resolve({ version: 2, entry: { ...entry, speechText: "Submitted" } })
    else pending.reject(new Error("Speech changed"))
  })
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Same-batch successor")
  expect(dirtyIds).toEqual(["speech-text:fr:phrase"])

  await act(async () => { await leave.saveAndStay() })
  expect(calls.speech.mock.calls[1]).toEqual([
    "book", "fr", "phrase", "Same-batch successor", outcome === "success" ? 2 : 1, "source",
  ])
  expect(dirtyIds).toEqual([])
})

it("saves a successor that returns to the previous text after its own save succeeds", async () => {
  const pending = deferred()
  calls.speech.mockReturnValueOnce(pending.promise).mockResolvedValue({ version: 3, entry })
  setup(<CoreTtsSpeechEditor {...props} />)
  edit("Submitted")
  fireEvent.click(screen.getByRole("button", { name: "Save speech text" }))
  await act(async () => {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Prepared" } })
    pending.resolve({ version: 2, entry: { ...entry, speechText: "Submitted" } })
  })

  await act(async () => { await leave.saveAndStay() })
  expect(calls.speech.mock.calls[1]).toEqual(["book", "fr", "phrase", "Prepared", 2, "source"])
  expect(dirtyIds).toEqual([])
})

it("Save & leave rejects a successor created during its request, then saves that successor", async () => {
  const pending = deferred()
  calls.speech.mockReturnValueOnce(pending.promise).mockResolvedValue({ version: 3, entry })
  setup(<CoreTtsSpeechEditor {...props} />)
  edit("Submitted")
  let saved!: Promise<unknown>
  await act(async () => { saved = leave.saveAndStay().catch(error => error) })
  await act(async () => {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Successor" } })
    pending.resolve({ version: 2, entry })
  })
  expect(await saved).toEqual(new Error("Newer edits are still unsaved. Save them before leaving."))
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Successor")

  await act(async () => { await leave.saveAndStay() })
  expect(calls.speech.mock.calls[1][4]).toBe(2)
})

it.each(["success", "failure"])("ignores an old book's late %s while a new scope owns its request", async outcome => {
  const oldRequest = deferred()
  const currentRequest = deferred()
  calls.speech.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(currentRequest.promise).mockResolvedValue({ version: 9, entry })
  const view = setup(<CoreTtsSpeechEditor {...props} />)
  edit("Old scope draft")
  fireEvent.click(screen.getByRole("button", { name: "Save speech text" }))
  view.rerender(<CoreTtsSpeechEditor {...props} bookLabel="other" version={7} sourceSignature="other-source" />)
  edit("New scope submitted")
  fireEvent.click(screen.getByRole("button", { name: "Save speech text" }))
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "New scope successor" } })

  await act(async () => {
    if (outcome === "success") oldRequest.resolve({ version: 2, entry })
    else oldRequest.reject(new Error("Old scope failure"))
  })
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("New scope successor")
  expect((screen.getByRole("button", { name: "Save speech text" }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText("Old scope failure")).toBeNull()

  await act(async () => currentRequest.resolve({ version: 8, entry }))
  await act(async () => { await leave.saveAndStay() })
  expect(calls.speech.mock.calls[2]).toEqual(["other", "fr", "phrase", "New scope successor", 8, "other-source"])
})

it("retains a successor through a neighboring entry save without adopting the neighbor version", async () => {
  const neighbor = { ...entry, id: "neighbor" }
  const firstRequest = deferred()
  const neighborRequest = deferred()
  calls.speech.mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(neighborRequest.promise).mockResolvedValue({ version: 4, entry })
  setup(<><CoreTtsSpeechEditor {...props} /><CoreTtsSpeechEditor {...props} entry={neighbor} /></>)
  fireEvent.click(screen.getAllByRole("button", { name: "Edit speech text" })[0])
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Submitted first" } })
  fireEvent.click(screen.getByRole("button", { name: "Edit speech text" }))
  fireEvent.change(screen.getAllByRole("textbox")[1], { target: { value: "Submitted neighbor" } })
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
  expect(calls.speech).toHaveBeenCalledTimes(2)
  fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "First successor" } })

  await act(async () => {
    firstRequest.resolve({ version: 2, entry })
    neighborRequest.resolve({ version: 3, entry: neighbor })
  })
  expect(dirtyIds).toEqual(["speech-text:fr:phrase"])
  await act(async () => { await leave.saveAndStay() })
  expect(calls.speech.mock.calls[2]).toEqual(["book", "fr", "phrase", "First successor", 2, "source"])
})

it("blocks editing and aggregate saving while a restore owns the editor", async () => {
  const view = setup(<CoreTtsSpeechEditor {...props} />)
  edit("Retained draft")
  view.rerender(<CoreTtsSpeechEditor {...props} restoring />)
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true)
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Forbidden change" } })
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Retained draft")
  expect(leave.canSave).toBe(false)
  await expect(leave.saveAndStay()).rejects.toThrow("Please wait")
  expect(calls.speech).not.toHaveBeenCalled()
})
