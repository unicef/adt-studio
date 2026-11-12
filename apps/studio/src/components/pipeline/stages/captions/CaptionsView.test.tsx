// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"

const calls = vi.hoisted(() => ({ save: vi.fn(), page: vi.fn(), outputs: vi.fn() }))
const saveActions = vi.hoisted(() => ({ stay: async () => {}, discard: () => {}, restore: () => {} }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""), i18n: { locale: "en" } }),
}))
vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getPage: calls.page, getPageImage: async () => ({}), updateImageCaptioning: calls.save, getOutputs: calls.outputs, getOutputSummary: async () => ({ legacyBaselineRevision: 1, stages: {}, stagesWithoutMissing: {}, missingStages: [] }) } }))
vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: [{pageId:"pg001",pageNumber:1,imageCount:1,hasCaptioning:true,sectionCount:1},{pageId:"pg002",pageNumber:2,imageCount:1,hasCaptioning:true,sectionCount:1}], isLoading: false }),
  usePage: (label: string, pageId: string) => useQuery({ queryKey: ["books", label, "pages", pageId], queryFn: calls.page, staleTime: Infinity }),
  usePageImage: () => ({ data: undefined }),
}))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: undefined }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ isRunning: false, stageState: () => "done", queueRun: () => {} }) }))
vi.mock("../../pipeline-i18n", () => ({ getStageLabelI18n: (value: string) => value }))
vi.mock("../../components/VersionPicker", () => ({ VersionPicker: ({ onSave, onSaveStay, onDiscard, onRestored, saving, dirty, itemId }: { itemId: string; onSave: () => void; onSaveStay: () => Promise<void>; onDiscard: () => void; onRestored: () => void; saving: boolean; dirty: boolean }) => {
  saveActions.stay = onSaveStay
  saveActions.discard = onDiscard
  saveActions.restore = onRestored
  return <button aria-busy={saving} disabled={saving || !dirty} onClick={() => onSave()}>Save staged captions {itemId}</button>
} }))
vi.mock("../../components/floating-save", () => ({ PendingChip: () => null, useFloatingSaveDirtyEntries: () => [] }))
vi.mock("./components/Lightbox", () => ({ Lightbox: () => null }))

let client: QueryClient
afterEach(() => { cleanup(); client?.clear(); vi.resetAllMocks() })


const header = vi.hoisted(() => ({ setExtra: () => {} }))
vi.mock("@/routes/books.$label", () => ({ useSectionNav: () => ({ sectionIndex: 0, setSectionIndex: () => {} }) }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => header }))
const { CaptionsView } = await import("./CaptionsView")


it.each([
  ["textarea", "zzzz-no-results"], ["textarea", "image2"],
  ["staged", "zzzz-no-results"], ["staged", "image2"],
  ["saving", "zzzz-no-results"], ["saving", "image2"],
])("retains a %s caption and save registration when searching for %s", async (mode, searchValue) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const page = { versions: { imageCaptioning: 1 }, captionSourceSignature: "source", imageCaptioning: { captions: [{ imageId: "image", caption: "Original", reasoning: "", source: "ai" }] } }
  const page2 = { ...page, imageCaptioning: { captions: [{ imageId: "image2", caption: "Other page", reasoning: "", source: "ai" }] } }
  client.setQueryData(["books", "book", "pages", "pg001"], page)
  client.setQueryData(["books", "book", "pages", "pg002"], page2)
  calls.page.mockResolvedValue(page)
  calls.outputs.mockResolvedValue({ outputs: [] })
  let finish!: () => void
  calls.save.mockImplementation(() => new Promise((_resolve, reject) => { finish = () => reject(new Error("Caption changed")) }))
  render(<QueryClientProvider client={client}><CaptionsView bookLabel="book" /></QueryClientProvider>)
  fireEvent.click((await screen.findAllByTitle("Click to edit caption"))[0])
  fireEvent.change(screen.getByLabelText("Caption for image"), { target: { value: "Unsaved caption draft" } })
  if (mode !== "textarea") {
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(calls.save).toHaveBeenCalledTimes(1))
    if (mode === "staged") await act(async () => { finish(); await new Promise(resolve => setTimeout(resolve, 450)) })
  }
  const search = screen.getByPlaceholderText("Search captions or image IDs…")
  fireEvent.change(search, { target: { value: searchValue } })
  expect(screen.queryByText("No captions match your search")).toBeNull()
  const save = screen.getByRole("button", { name: "Save staged captions pg001" }) as HTMLButtonElement
  expect(save.disabled).toBe(mode === "saving")
  if (mode === "textarea") expect((screen.getByLabelText("Caption for image") as HTMLTextAreaElement).value).toBe("Unsaved caption draft")
  else expect(screen.getByText("Unsaved caption draft")).toBeTruthy()
  fireEvent.change(search, { target: { value: "" } })
  expect(screen.getByRole("button", { name: "Save staged captions pg001" })).toBeTruthy()
  if (mode === "saving") await act(async () => { finish(); await new Promise(resolve => setTimeout(resolve, 450)) })
  expect(calls.save).toHaveBeenCalledTimes(mode === "textarea" ? 0 : 1)
})
