// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const speechRouting = vi.hoisted(() => ({ config: {} as Record<string, unknown>, available: [] as string[], globalAvailable: false, queueRun: vi.fn() }))
const saveActions = vi.hoisted(() => ({ stay: async () => {}, restoring: (_next: boolean) => {}, speechRestoring: false, discard: () => {}, speechEditing: (_id: string, _language: string, _editing: boolean) => {} }))
const join = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: join, i18n: { locale: "en", _: (value: { message: string }) => value.message } }) }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <span>{children}</span> }))
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: ({ count }: { count: number }) => ({ getTotalSize: () => count * 100, getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 100, size: 100 })), measureElement: () => {}, scrollToIndex: () => {} }) }))
vi.mock("@/hooks/use-book-config", () => ({ useBookConfig: () => ({ data: { config: {} } }), useUpdateBookConfig: () => ({ mutateAsync: vi.fn() }) }))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => ({ data: { merged: { output_languages: ["fr", "es"], editing_language: "en", speech: speechRouting.config, translation_evaluation: { enabled: false } } } }) }))
vi.mock("@/hooks/use-books", () => ({ useBook: () => ({ data: { languageCode: "en" }, isLoading: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "done", stepProgress: {}, queueRun: speechRouting.queueRun, cancelRun: vi.fn(), isCancelling: false }) }))
vi.mock("@/hooks/use-book-tasks", () => ({ useBookTasks: () => ({ isTaskRunning: () => false, tasks: [] }) }))
vi.mock("@/hooks/use-stage-missing-counts", () => ({ useStageMissingCounts: () => ({ translate: 0, speech: 0 }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ isAvailable: (_modality: string, model: string) => speechRouting.available.includes(model?.split(":")[0]), hasSpeechProvider: speechRouting.globalAvailable, hasTranscriber: false }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-elevenlabs-voices", () => ({ useElevenLabsVoices: () => ({ describeVoice: () => "" }) }))
vi.mock("@/hooks/use-tts", () => ({ useTTSData: () => ({ data: { languages: {} } }) }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ headerSlotEl: document.body }) }))
vi.mock("../../components/OutputReview", () => ({ OutputReview: () => null, useOutputs: () => ({ data: { outputs: [] } }) }))
vi.mock("./components/CoreTtsSpeechEditor", () => ({ CoreTtsBadges: () => null, CoreTtsSpeechEditor: ({ onEditingChange, restoring }: { onEditingChange: typeof saveActions.speechEditing; restoring: boolean }) => { saveActions.speechEditing = onEditingChange; saveActions.speechRestoring = restoring; return null } }))
vi.mock("@/components/pipeline/components/VersionPicker", () => ({ VersionPicker: ({ onSave, onSaveStay, onDiscard, onRestoringChange, dirty, saving }: { onRestoringChange: (next: boolean) => void; onSave: () => Promise<void>; onSaveStay: () => Promise<void>; onDiscard: () => void; dirty: boolean; saving: boolean }) => {
  saveActions.stay = onSaveStay
  saveActions.discard = onDiscard
  saveActions.restoring = onRestoringChange
  return <button disabled={!dirty || saving} onClick={() => { void onSave().catch(() => {}) }}>Save translation</button>
} }))
vi.mock("@/api/client", () => ({ BASE_URL: "", getAudioUrl: () => "", api: { getTextCatalog: vi.fn(), getEasyRead: vi.fn().mockResolvedValue(null), listTranslatedImages: vi.fn().mockResolvedValue({ images: [] }), updateTranslation: vi.fn(), getVoiceMappings: vi.fn().mockResolvedValue({}) } }))

const { api } = await import("@/api/client")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { LanguageView } = await import("./LanguageView")
let client: QueryClient
beforeEach(() => { vi.clearAllMocks(); speechRouting.config = {}; speechRouting.available = []; speechRouting.globalAvailable = false; saveActions.stay = async () => { throw new Error("Save controls have not rendered") } })
afterEach(() => { cleanup(); client?.clear() })

it.each(["conflict", "successor"])("Save & leave retains a translation %s draft and permits a guarded retry", async mode => {
  const catalog = { version: 4, entries: [{ id: "pg001_text", text: "Original source" }], translations: { fr: { version: 1, sourceSignature: "source", entries: [{ id: "pg001_text", text: "Traduction originale" }] } } }
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(["books", "book", "text-catalog"], catalog)
  vi.mocked(api.getTextCatalog).mockResolvedValue(catalog as never)
  let finish!: () => void
  vi.mocked(api.updateTranslation).mockImplementationOnce(() => new Promise((resolve, reject) => { finish = () => mode === "conflict" ? reject(new Error("Translation changed")) : resolve({ version: 2 }) })).mockResolvedValue({ version: 3 })
  render(<QueryClientProvider client={client}><TooltipProvider><LanguageView bookLabel="book" /></TooltipProvider></QueryClientProvider>)
  fireEvent.change(await screen.findByPlaceholderText("Pending..."), { target: { value: "First submitted translation" } })
  let saved!: Promise<void>
  let settled = false
  await act(async () => { saved = saveActions.stay(); void saved.then(() => { settled = true }, () => { settled = true }) })
  expect(settled).toBe(false)
  await act(async () => { await expect(saveActions.stay()).rejects.toThrow("A save is still in progress") })
  expect(api.updateTranslation).toHaveBeenCalledTimes(1)
  if (mode === "successor") fireEvent.change(screen.getByPlaceholderText("Pending..."), { target: { value: "Newer translation draft" } })
  await act(async () => { finish(); await expect(saved).rejects.toBeInstanceOf(Error) })
  const retained = mode === "successor" ? "Newer translation draft" : "First submitted translation"
  expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe(retained)
  await act(async () => { await saveActions.stay() })
  expect(api.updateTranslation).toHaveBeenLastCalledWith("book", "fr", expect.objectContaining({ baseVersion: mode === "successor" ? 2 : 1, sourceVersion: 4, sourceSignature: "source", entries: [{ id: "pg001_text", text: retained }] }))
  expect((screen.getByRole("button", { name: "Save translation" }) as HTMLButtonElement).disabled).toBe(true)
})

function renderLanguages(stageSlug = "translate") {
  const catalog = { version: 4, entries: [{ id: "pg001_text", text: "Original source" }], translations: {
    fr: { version: 1, sourceSignature: "source-fr", entries: [{ id: "pg001_text", text: "Traduction originale" }] },
    es: { version: 7, sourceSignature: "source-es", entries: [{ id: "pg001_text", text: "Traducción original" }] },
  } }
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(["books", "book", "text-catalog"], catalog)
  vi.mocked(api.getTextCatalog).mockResolvedValue(catalog as never)
  return render(<QueryClientProvider client={client}><TooltipProvider><LanguageView bookLabel="book" stageSlug={stageSlug} /></TooltipProvider></QueryClientProvider>)
}

it("keeps the selected language and unsaved translation when another language is clicked", async () => {
  renderLanguages()
  const input = await screen.findByPlaceholderText("Pending...")
  const spanish = screen.getByRole("button", { name: /Spanish.*es/ }) as HTMLButtonElement
  // The ref guard also covers a click in the same batch as the edit, before
  // React has rendered the disabled pill.
  act(() => {
    fireEvent.change(input, { target: { value: "French draft to keep" } })
    fireEvent.click(spanish)
  })
  expect(spanish.disabled).toBe(true)
  expect(spanish.title).toBe("Save or discard your edits first")
  expect(screen.getByText("Save or discard your edits first")).toBeTruthy()
  expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe("French draft to keep")
  expect(api.updateTranslation).not.toHaveBeenCalled()

  act(() => saveActions.discard())
  expect(spanish.disabled).toBe(false)
  fireEvent.click(spanish)
  expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe("Traducción original")
})

it("keeps a saving language selected after discard and uses the next language's own version", async () => {
  renderLanguages()
  let finish!: () => void
  vi.mocked(api.updateTranslation)
    .mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ version: 2 }) }))
    .mockResolvedValue({ version: 8 })
  fireEvent.change(await screen.findByPlaceholderText("Pending..."), { target: { value: "Submitted French" } })
  let saved!: Promise<void>
  await act(async () => { saved = saveActions.stay() })
  act(() => saveActions.discard())
  const spanish = screen.getByRole("button", { name: /Spanish.*es/ }) as HTMLButtonElement
  expect(spanish.disabled).toBe(true)
  expect(spanish.title).toBe("Please wait for the current operation to finish")
  fireEvent.click(spanish)
  expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe("Traduction originale")
  await act(async () => { finish(); await saved })
  expect(spanish.disabled).toBe(false)
  fireEvent.click(spanish)
  fireEvent.change(screen.getByPlaceholderText("Pending..."), { target: { value: "New Spanish translation" } })
  await act(async () => { await saveActions.stay() })
  expect(api.updateTranslation).toHaveBeenLastCalledWith("book", "es", {
    baseVersion: 7, sourceVersion: 4, sourceSignature: "source-es",
    entries: [{ id: "pg001_text", text: "New Spanish translation" }],
  })
})

it("keeps the selected language while a prepared speech editor has a draft", async () => {
  renderLanguages()
  await screen.findByPlaceholderText("Pending...")
  const spanish = screen.getByRole("button", { name: /Spanish.*es/ }) as HTMLButtonElement
  act(() => {
    saveActions.speechEditing("pg001_text", "fr", true)
    fireEvent.click(spanish)
  })
  expect(spanish.disabled).toBe(true)
  expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe("Traduction originale")
  act(() => saveActions.speechEditing("pg001_text", "fr", false))
  expect(spanish.disabled).toBe(false)
  fireEvent.click(spanish)
  expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe("Traducción original")
})

it("allows a language change after every text edit is reverted", async () => {
  renderLanguages()
  const input = await screen.findByPlaceholderText("Pending...")
  fireEvent.change(input, { target: { value: "Temporary French draft" } })
  fireEvent.change(input, { target: { value: "Traduction originale" } })
  const spanish = screen.getByRole("button", { name: /Spanish.*es/ }) as HTMLButtonElement
  expect(spanish.disabled).toBe(false)
  fireEvent.click(spanish)
  expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe("Traducción original")
  expect(api.updateTranslation).not.toHaveBeenCalled()
})

it.each(["success", "failure"])("ignores an old book's late translation %s while a new book is saving", async outcome => {
  const view = renderLanguages()
  const firstCatalog = client.getQueryData(["books", "book", "text-catalog"]) as { version: number; entries: {id: string; text: string}[]; translations: {fr: {version: number; sourceSignature: string; entries: {id: string; text: string}[]}} }
  const otherCatalog = { ...firstCatalog, translations: { fr: { ...firstCatalog.translations.fr, version: 7, sourceSignature: "other-source" } } }
  client.setQueryData(["books", "other", "text-catalog"], otherCatalog)
  vi.mocked(api.getTextCatalog).mockImplementation(async label => (label === "other" ? otherCatalog : firstCatalog) as never)
  let finishFirst!: () => void
  let finishOther!: () => void
  vi.mocked(api.updateTranslation)
    .mockImplementationOnce(() => new Promise((resolve, reject) => { finishFirst = () => outcome === "failure" ? reject(new Error("First book changed")) : resolve({ version: 2 }) }))
    .mockImplementationOnce(() => new Promise(resolve => { finishOther = () => resolve({ version: 8 }) }))
    .mockResolvedValue({ version: 9 })
  fireEvent.change(await screen.findByPlaceholderText("Pending..."), { target: { value: "First book submitted" } })
  fireEvent.click(screen.getByRole("button", { name: "Save translation" }))
  view.rerender(<QueryClientProvider client={client}><TooltipProvider><LanguageView bookLabel="other" /></TooltipProvider></QueryClientProvider>)
  fireEvent.change(await screen.findByPlaceholderText("Pending..."), { target: { value: "Other book submitted" } })
  fireEvent.click(screen.getByRole("button", { name: "Save translation" }))
  expect(api.updateTranslation).toHaveBeenLastCalledWith("other", "fr", expect.objectContaining({ baseVersion: 7, sourceSignature: "other-source" }))
  fireEvent.change(screen.getByPlaceholderText("Pending..."), { target: { value: "Other book successor" } })
  await act(async () => { finishFirst(); await new Promise(resolve => setTimeout(resolve, 450)) })
  expect((screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement).value).toBe("Other book successor")
  expect((screen.getByRole("button", { name: "Save translation" }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText("First book changed")).toBeNull()
  await act(async () => { finishOther(); await new Promise(resolve => setTimeout(resolve, 450)) })
  await act(async () => { await saveActions.stay() })
  expect(api.updateTranslation).toHaveBeenLastCalledWith("other", "fr", expect.objectContaining({ baseVersion: 8, sourceSignature: "other-source", entries: [{ id: "pg001_text", text: "Other book successor" }] }))
})


it("blocks translation, language selection and prepared speech editing during restore", async () => {
  renderLanguages()
  fireEvent.change(await screen.findByPlaceholderText("Pending..."), {target: {value: "Retained translation draft"}})
  act(() => saveActions.restoring(true))
  const input = screen.getByPlaceholderText("Pending...") as HTMLTextAreaElement
  expect(input.matches(":disabled")).toBe(true)
  fireEvent.change(input, {target: {value: "Blocked translation"}})
  expect(input.value).toBe("Retained translation draft")
  expect(saveActions.speechRestoring).toBe(true)
  act(() => saveActions.restoring(false))
  expect(input.value).toBe("Retained translation draft")
  expect(input.matches(":disabled")).toBe(false)
  expect(saveActions.speechRestoring).toBe(false)
})

it("uses the server receipt for a first translation save without a stored row", async () => {
  const catalog = { version: 4, entries: [{ id: "pg001_text", text: "Original source" }], translations: {}, translationSourceSignatures: { fr: "first-fr-source", es: "first-es-source" } }
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(["books", "book", "text-catalog"], catalog)
  vi.mocked(api.getTextCatalog).mockResolvedValue(catalog as never)
  vi.mocked(api.updateTranslation).mockResolvedValue({version: 1})
  render(<QueryClientProvider client={client}><TooltipProvider><LanguageView bookLabel="book" /></TooltipProvider></QueryClientProvider>)
  fireEvent.change(await screen.findByPlaceholderText("Pending..."), {target: {value: "Ma première traduction"}})
  fireEvent.click(await screen.findByRole("button", {name: "Save translation"}))
  await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledTimes(1))
  expect(api.updateTranslation).toHaveBeenCalledWith("book", "fr", {entries: [{id: "pg001_text", text: "Ma première traduction"}], baseVersion: 0, sourceVersion: 4, sourceSignature: "first-fr-source"})
})


it.each([
  {name: "book default", config: {default_provider: "gemini"}, available: ["gemini"], global: false, enabled: true},
  {name: "source language omitted from outputs", config: {default_provider: "openai", providers: {gemini: {languages: ["en"]}}}, available: ["gemini"], global: false, enabled: true},
  {name: "language override", config: {default_provider: "openai", providers: {gemini: {languages: ["fr", "es"]}}}, available: ["gemini"], global: false, enabled: true},
  {name: "secondary narrator", config: {default_provider: "openai", secondary_voices: {fr: {provider: "gemini", voice: "Kore"}}}, available: ["gemini"], global: false, enabled: true},
  {name: "unconfigured provider", config: {default_provider: "gemini"}, available: ["openai"], global: true, enabled: false},
  {name: "unrelated secondary locale", config: {default_provider: "openai", secondary_voices: {sq: {provider: "gemini", voice: "Kore"}}}, available: ["gemini"], global: false, enabled: false},
])("Speech Run honors $name rather than global provider availability", async scenario => {
  speechRouting.config = scenario.config
  speechRouting.available = scenario.available
  speechRouting.globalAvailable = scenario.global
  renderLanguages("speech")
  const run = await screen.findByRole("button", {name: "Re-run speech"}) as HTMLButtonElement
  expect(run.disabled).toBe(!scenario.enabled)
  fireEvent.click(run)
  expect(speechRouting.queueRun).toHaveBeenCalledTimes(scenario.enabled ? 1 : 0)
  if (scenario.enabled) expect(speechRouting.queueRun).toHaveBeenCalledWith(expect.objectContaining({fromStage: "speech", toStage: "speech"}))
})
