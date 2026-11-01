// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const speechRouting = vi.hoisted(() => ({ languages: ["fr", "es"], config: {} as Record<string, unknown>, tts: { languages: {} } as { languages: Record<string, { entries: unknown[]; storageLanguage?: string }> }, available: [] as string[], globalAvailable: false, queueRun: vi.fn() }))
const saveActions = vi.hoisted(() => ({ stay: async () => {}, restoring: (_next: boolean) => {}, speechRestoring: false, discard: () => {}, speechEditing: (_id: string, _language: string, _editing: boolean) => {} }))
const join = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: join, i18n: { locale: "en", _: (value: { message: string }) => value.message } }) }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <span>{children}</span> }))
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: ({ count }: { count: number }) => ({ getTotalSize: () => count * 100, getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 100, size: 100 })), measureElement: () => {}, scrollToIndex: () => {} }) }))
vi.mock("@/hooks/use-book-config", () => ({ useBookConfig: () => ({ data: { config: {} } }), useUpdateBookConfig: () => ({ mutateAsync: vi.fn() }) }))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => ({ data: { merged: { output_languages: speechRouting.languages, editing_language: "en", speech: speechRouting.config, translation_evaluation: { enabled: false } } } }) }))
vi.mock("@/hooks/use-books", () => ({ useBook: () => ({ data: { languageCode: "en" }, isLoading: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "done", stepProgress: {}, queueRun: speechRouting.queueRun, cancelRun: vi.fn(), isCancelling: false }) }))
vi.mock("@/hooks/use-book-tasks", () => ({ useBookTasks: () => ({ isTaskRunning: () => false, tasks: [] }) }))
vi.mock("@/hooks/use-stage-missing-counts", () => ({ useStageMissingCounts: () => ({ translate: 0, speech: 0 }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ isAvailable: (_modality: string, model: string) => speechRouting.available.includes(model?.split(":")[0]), hasSpeechProvider: speechRouting.globalAvailable, hasTranscriber: false }), useBookStructuredTextAvailability: () => true, useWordHighlightingUnavailable: () => true }))
vi.mock("@/hooks/use-elevenlabs-voices", () => ({ useElevenLabsVoices: () => ({ describeVoice: () => "" }) }))
vi.mock("@/hooks/use-tts", () => ({ useTTSData: () => ({ data: speechRouting.tts }) }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ headerSlotEl: document.body }) }))
vi.mock("./components/CoreTtsSpeechEditor", () => ({ CoreTtsBadges: () => null, CoreTtsSpeechEditor: ({ onEditingChange, restoring }: { onEditingChange: typeof saveActions.speechEditing; restoring: boolean }) => { saveActions.speechEditing = onEditingChange; saveActions.speechRestoring = restoring; return null } }))
vi.mock("@/components/pipeline/components/VersionPicker", () => ({ VersionPicker: ({ onSave, onSaveStay, onDiscard, onRestoringChange, dirty, saving }: { onRestoringChange: (next: boolean) => void; onSave: () => Promise<void>; onSaveStay: () => Promise<void>; onDiscard: () => void; dirty: boolean; saving: boolean }) => {
  saveActions.stay = onSaveStay
  saveActions.discard = onDiscard
  saveActions.restoring = onRestoringChange
  return <button disabled={!dirty || saving} onClick={() => { void onSave().catch(() => {}) }}>Save translation</button>
} }))
vi.mock("@/api/client", async (importOriginal) => ({ ApiError: (await importOriginal<typeof import("@/api/client")>()).ApiError, BASE_URL: "", getAudioUrl: vi.fn(() => ""), api: { getTextCatalog: vi.fn(), getEasyRead: vi.fn().mockResolvedValue(null), listTranslatedImages: vi.fn().mockResolvedValue({ images: [] }), updateTranslation: vi.fn(), getVoiceMappings: vi.fn().mockResolvedValue({}), getOutputSummary: vi.fn(), getOutputs: vi.fn(), reviewOutput: vi.fn(), runStages: vi.fn(), getWordTimestamps: vi.fn(), saveWordTimestamps: vi.fn() } }))

const { api } = await import("@/api/client")
const { ApiError } = await import("@/api/client")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { LanguageView } = await import("./LanguageView")
const translationReply = (version: number, data: unknown) => ({ version, entries: (data as { entries: import("@/api/client").TextCatalogEntry[] }).entries })
const savedTranslation = (version: number) => async (_label: string, _language: string, data: unknown) => translationReply(version, data)
let client: QueryClient
beforeEach(() => { vi.clearAllMocks(); speechRouting.languages = ["fr", "es"]; speechRouting.config = {}; speechRouting.tts = { languages: {} }; speechRouting.available = []; speechRouting.globalAvailable = false; saveActions.stay = async () => { throw new Error("Save controls have not rendered") } })
afterEach(() => { cleanup(); client?.clear() })

it.each(["load-latest", "converged-409", "refetch"] as const)("releases a resolved net-clean translation after %s and permits the next review and Save", async recovery => {
  const initial = { id: "pg001_text", text: "Initial translation", source: "manual" as const }
  let catalog = { version: 4, entries: [{ id: initial.id, text: "Source" }], translations: { fr: { version: 1, sourceSignature: "source-1", entries: [initial] } } }
  const output = { identity: { kind: "translation", id: initial.id, language: "fr" }, signature: "source-1", contentHash: "hash", text: initial.text, sourceText: "Source", usable: true, manual: true, protected: true, current: false, missing: false, excluded: false, updateNeeded: false, warnings: [{ reason: "legacy" }], pageIds: [], sectionIds: [] }
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(["books", "book", "text-catalog"], catalog)
  vi.mocked(api.getTextCatalog).mockImplementation(async () => catalog as never)
  vi.mocked(api.getOutputSummary).mockResolvedValue({ legacyBaselineRevision: 1, stages: {} } as never)
  vi.mocked(api.getOutputs).mockResolvedValue({ outputs: [output], missingStages: [] } as never)
  vi.mocked(api.reviewOutput).mockResolvedValue({} as never)
  vi.mocked(api.updateTranslation).mockRejectedValueOnce(new ApiError("Changed by another writer", 409))
  render(<QueryClientProvider client={client}><TooltipProvider><LanguageView bookLabel="book" /></TooltipProvider></QueryClientProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Translation: Edited manually" }))
  fireEvent.change(await screen.findByPlaceholderText("Pending..."), { target: { value: "My correction" } })
  expect(screen.queryByRole("button", { name: "Keep my edit" })).toBeNull()
  catalog = { ...catalog, translations: { fr: { version: 2, sourceSignature: "source-2", entries: [{ ...initial, text: recovery === "load-latest" ? "Their correction" : "My correction" }] } } }
  if (recovery === "refetch") {
    await act(async () => { await client.invalidateQueries({ queryKey: ["books", "book", "text-catalog"] }) })
  } else {
    fireEvent.click(screen.getByRole("button", { name: "Save translation" }))
    if (recovery === "load-latest") {
      const latest = await screen.findByRole("button", { name: "Load latest saved values" })
      expect(screen.queryByRole("button", { name: "Keep my edit" })).toBeNull()
      fireEvent.click(latest)
    }
  }
  fireEvent.click(await screen.findByRole("button", { name: "Keep my edit" }))
  await waitFor(() => expect(api.reviewOutput).toHaveBeenCalledTimes(1))
  expect((screen.getByRole("button", { name: "Save translation" }) as HTMLButtonElement).disabled).toBe(true)
  expect(api.runStages).not.toHaveBeenCalled()
  vi.mocked(api.updateTranslation).mockReset().mockImplementation(savedTranslation(3))
  fireEvent.change(screen.getByPlaceholderText("Pending..."), { target: { value: "Next correction" } })
  fireEvent.click(screen.getByRole("button", { name: "Save translation" }))
  await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith("book", "fr", expect.objectContaining({ baseVersion: 2, sourceSignature: "source-2", entries: [{ ...initial, text: "Next correction" }] })))
})



it.each([false, true])("a never-saved net-clean translation unlocks real review and adopts its next refetch (duplicates=%s)", duplicate => {
  return exerciseNetClean(duplicate)
})
it.each(["speech", "timings", "restore"] as const)("net-clean translation still blocks review during %s", barrier => exerciseNetClean(false, barrier))
it("net-clean duplicate edits expose conflict review without accepting or normalizing hidden corrections", () => exerciseNetClean(true, undefined, true))
async function exerciseNetClean(duplicate: boolean, barrier?: "speech" | "timings" | "restore", conflict = false) {
  const initial = { id: "pg001_text", text: "Traduction originale", source: "manual" as const }
  let catalog = { version: 4, entries: [{ id: initial.id, text: "Original source" }], translations: { fr: { version: 1, sourceSignature: "source", entries: duplicate ? [initial, { ...initial, text: conflict ? "Hidden correction" : initial.text }] : [initial] } } }
  const output = { identity: { kind: "translation", id: initial.id, language: "fr" }, signature: "source", contentHash: "hash", text: initial.text, sourceText: "Original source", usable: true, manual: true, protected: true, current: false, missing: false, excluded: false, updateNeeded: false, warnings: [{ reason: "legacy" }], pageIds: [], sectionIds: [] }
  if (conflict) output.warnings.push({ reason: "output-conflict" })
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(["books", "book", "text-catalog"], catalog)
  vi.mocked(api.getTextCatalog).mockImplementation(async () => catalog as never)
  vi.mocked(api.getOutputSummary).mockResolvedValue({ legacyBaselineRevision: 1, stages: {} } as never)
  vi.mocked(api.getOutputs).mockResolvedValue({ outputs: [output], missingStages: [] } as never)
  vi.mocked(api.reviewOutput).mockImplementation(async () => {
    // An independent writer commits after the accepted review, before refetch.
    catalog = { ...catalog, translations: { fr: { ...catalog.translations.fr, version: 2, entries: [{ ...initial, text: "Newly saved text" }] } } }
    return {} as never
  })
  vi.mocked(api.updateTranslation).mockImplementation(savedTranslation(3))
  render(<QueryClientProvider client={client}><TooltipProvider><LanguageView bookLabel="book" /></TooltipProvider></QueryClientProvider>)
  const input = await screen.findByPlaceholderText("Pending...")
  fireEvent.change(input, { target: { value: "Temporary change" } })
  fireEvent.change(input, { target: { value: initial.text } })
  expect((screen.getByRole("button", { name: "Save translation" }) as HTMLButtonElement).disabled).toBe(true)
  const setBarrier = (active: boolean) => barrier === "restore" ? saveActions.restoring(active) : saveActions.speechEditing(barrier === "timings" ? "timings:primary:pg001_text" : initial.id, "fr", active)
  fireEvent.click(await screen.findByRole("button", { name: "Translation: Edited manually" }))
  if (conflict) {
    expect(await screen.findByText(/Multiple retained outputs share this ID/)).toBeTruthy()
    expect(screen.queryByText("Save or cancel your draft before reviewing outputs.")).toBeNull()
    expect(screen.queryByRole("button", { name: "Keep my edit" })).toBeNull()
    expect((screen.getByRole("button", { name: "Regenerate" }) as HTMLButtonElement).disabled).toBe(false)
    expect(catalog.translations.fr.entries[1].text).toBe("Hidden correction")
    expect(client.getQueryData(["books", "book", "text-catalog"])).toEqual(catalog)
    expect(api.reviewOutput).not.toHaveBeenCalled()
    expect(api.updateTranslation).not.toHaveBeenCalled()
    expect(api.runStages).not.toHaveBeenCalled()
    return
  }
  if (barrier) {
    act(() => setBarrier(true))
    expect(await screen.findByText("Save or cancel your draft before reviewing outputs.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Keep my edit" })).toBeNull()
    expect(api.reviewOutput).not.toHaveBeenCalled()
    act(() => setBarrier(false))
  }
  const keep = await screen.findByRole("button", { name: "Keep my edit" })
  fireEvent.click(keep)
  await waitFor(() => expect(api.reviewOutput).toHaveBeenCalledTimes(1))
  await waitFor(() => expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe("Newly saved text"))
  expect(api.updateTranslation).not.toHaveBeenCalled()
  fireEvent.change(screen.getByPlaceholderText("Pending..."), { target: { value: "Next correction" } })
  fireEvent.click(screen.getByRole("button", { name: "Save translation" }))
  await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith("book", "fr", expect.objectContaining({ baseVersion: 2, entries: [{ id: initial.id, text: "Next correction", source: "manual" }] })))
}
