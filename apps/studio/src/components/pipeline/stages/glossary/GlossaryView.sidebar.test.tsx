// @vitest-environment jsdom
import React, { createContext, useContext, useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const join = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")

// Vitest does not compile Lingui macros.
vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: join, i18n: { _: (d: { message: string }) => d.message } }),
}))

const glossary = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  items: [{ id: "gl001", word: "Nile", definition: "A river in Africa", variations: [], emojis: [], source: "ai" }],
}
let servedGlossary = glossary
const HeaderContext = createContext<{ setExtra: (extra: ReactNode) => void }>({ setExtra: () => {} })
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => useContext(HeaderContext) }))
vi.mock("@/hooks/use-glossary", () => ({ useGlossary: () => ({ data: servedGlossary, isLoading: false }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isCompleted: false, isRunning: false }) }))
vi.mock("./GlossaryLandingPage", () => ({ GlossaryLandingPage: () => <div>Glossary landing</div> }))
vi.mock("@/hooks/use-sign-language-videos", () => ({
  useSignLanguageVideos: () => ({ data: { videos: [] } }),
  useUploadSignLanguageVideo: () => ({ mutate: vi.fn(), isPending: false }),
  useAssignSignLanguageVideo: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSignLanguageVideo: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "idle", queueRun: vi.fn() }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "" }), useBookStructuredTextAvailability: () => true }))
vi.mock("../../components/StageRunCard", () => ({ StageRunCard: () => null }))
vi.mock("../../components/VersionPicker", () => ({
  VersionPicker: ({ onSave, dirty, saving }: { onSave: () => void; dirty: boolean; saving: boolean }) => <button type="button" disabled={!dirty || saving} onClick={onSave}>Save</button>,
}))
vi.mock("./AddGlossaryDialog", () => ({ AddGlossaryDialog: () => null }))
vi.mock("./components/GlossaryImagePickerDialog", () => ({ GlossaryImagePickerDialog: () => null }))
vi.mock("./components/GlossaryHintBanner", () => ({ GlossaryHintBanner: () => null }))
vi.mock("./lib/occurrences", () => ({ useGlossaryOccurrences: () => ({ byItem: new Map(), isLoading: false }) }))
vi.mock("@/api/client", () => ({ api: { updateGlossary: vi.fn() }, BASE_URL: "", getSignLanguageVideoUrl: () => "" }))

vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn() } }))
const { toast } = await import("@/components/ui/sonner")
const { api } = await import("@/api/client")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { GlossaryIndex } = await import("./GlossaryIndex")
let client: QueryClient

function Harness() {
  const [extra, setExtra] = useState<ReactNode>(null)
  return <HeaderContext.Provider value={{ setExtra }}>
    <header>{extra}</header>
    <GlossaryIndex bookLabel="book" />
  </HeaderContext.Provider>
}

async function editAndSave() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const refresh = vi.spyOn(client, "invalidateQueries")
  render(<QueryClientProvider client={client}><TooltipProvider><Harness /></TooltipProvider></QueryClientProvider>)
  fireEvent.change(await screen.findByLabelText("Definition for Nile"), { target: { value: "The longest river in Africa" } })
  fireEvent.click(await screen.findByRole("button", { name: "Save" }))
  await waitFor(() => expect(api.updateGlossary).toHaveBeenCalled())
  await waitFor(() => expect(refresh).toHaveBeenCalledWith({ queryKey: ["books", "book", "glossary"] }))
  return refresh.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(["books", "book", "outputs"])).length
}

beforeEach(() => {
  vi.clearAllMocks()
  servedGlossary = glossary
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
})
afterEach(() => {
  cleanup()
  client?.clear()
  vi.unstubAllGlobals()
})

describe("sidebar attention after a glossary save", () => {
  it.each([false, true])("refreshes Language and Speech attention exactly once (image requirements changed: %s)", async (imageRequirementsChanged) => {
    vi.mocked(api.updateGlossary).mockResolvedValue({ version: 2, imageRequirementsChanged })
    expect(await editAndSave()).toBe(1)
  })
})

it.each([false, true])("retains a rejected glossary draft through the route and enables saving again (empty refresh: %s)", async (emptyRefresh) => {
  vi.mocked(api.updateGlossary).mockRejectedValue(new Error("Glossary changed"))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><TooltipProvider><Harness /></TooltipProvider></QueryClientProvider>)
  fireEvent.change(await screen.findByLabelText("Definition for Nile"), { target: { value: "My retained draft" } })
  fireEvent.click(await screen.findByRole("button", { name: "Save" }))
  await waitFor(() => expect(toast.error).toHaveBeenCalled())
  await waitFor(() => expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false))
  expect((screen.getByLabelText("Definition for Nile") as HTMLTextAreaElement).value).toBe("My retained draft")
  expect(api.updateGlossary).toHaveBeenCalledWith("book", expect.objectContaining({ version: 1 }))
  servedGlossary = { ...glossary, version: 2, items: emptyRefresh ? [] : [{ ...glossary.items[0], definition: "Another writer's change" }] }
  view.rerender(<QueryClientProvider client={client}><TooltipProvider><Harness /></TooltipProvider></QueryClientProvider>)
  expect((screen.getByLabelText("Definition for Nile") as HTMLTextAreaElement).value).toBe("My retained draft")
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(api.updateGlossary).toHaveBeenCalledTimes(2))
  expect(api.updateGlossary).toHaveBeenLastCalledWith("book", expect.objectContaining({ version: 1 }))
})
