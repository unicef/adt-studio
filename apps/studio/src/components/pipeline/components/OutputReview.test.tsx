// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STAGE_ORDER, type CoreTtsCatalogEntry, type OutputStatus, type PackagingWarning, type StageName } from "@adt/types"
import type { TTSResponse } from "@/api/client"
import type { StageState } from "@/hooks/use-book-run"
import { shouldShowMissingSpeech } from "../stages/languages/lib/speech-review-state"

const calls = vi.hoisted(() => ({ run: vi.fn(), saveSpeech: vi.fn() }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({
  i18n: { locale: "en" },
  t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
}) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: undefined }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ isRunning: false }) }))
vi.mock("../pipeline-i18n", () => ({ getStageLabelI18n: (value: string) => value }))
vi.mock("./floating-save", () => ({ useFloatingSaveDirtyEntries: () => [], useFloatingSave: () => {} }))
vi.mock("@/api/client", () => ({ api: {
  getOutputs: async () => ({ outputs: [], summary: { updates: 0, warnings: 0, missing: 0 } }),
  runStages: calls.run, updateCoreTtsEntry: calls.saveSpeech,
} }))

const { OutputReview, CatalogSummary } = await import("./OutputReview")
const { CoreTtsSpeechEditor } = await import("../stages/languages/components/CoreTtsSpeechEditor")
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.clearAllMocks() })

function status(overrides: Partial<OutputStatus> = {}): OutputStatus {
  return { identity: { kind: "translation", id: "phrase", language: "fr" },
    signature: "inputs", contentHash: "content", usable: true, current: true,
    protected: true, manual: true, excluded: false, missing: false, updateNeeded: false,
    warnings: [], pageIds: [], sectionIds: [], ...overrides }
}

function setup(outputs: OutputStatus[], ownershipWarnings: PackagingWarning[] = [], missingStages: StageName[] = STAGE_ORDER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  client.setQueryData(["books", "book", "outputs", false, undefined], { outputs, ownershipWarnings, missingStages })
  clients.push(client)
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const review = { bookLabel: "book", id: "phrase", kinds: ["translation"] as ["translation"], language: "fr", compact: true }

it("AC-12 discloses unverifiable rendered ownership without offering generation or approval", () => {
  render(<CatalogSummary bookLabel="book" />, { wrapper: setup([], [{ kind: "orphaned-rendering", pageId: "pg001", sectionIndex: 0 }]) })
  expect(screen.getByText(/Some rendered sections on pg001 have no verified section owner/)).toBeTruthy()
  expect(screen.getByText(/Their content and history are retained/)).toBeTruthy()
  expect(screen.queryByRole("button", { name: /Repair section ownership/ })).toBeNull()
})

it("hides Missing output until its stage's first attempt, but keeps existing output's review", () => {
  const outputs = [
    status({ identity: { kind: "caption", id: "img1" }, usable: false, current: false, protected: false, manual: false, missing: true, text: "Never captioned" }),
    status({ identity: { kind: "translation", id: "phrase", language: "fr" }, protected: false, manual: false, current: false, updateNeeded: true, text: "Stale translation" }),
  ]
  const { unmount } = render(<><CatalogSummary bookLabel="book" stage="captions" expanded /><OutputReview {...review} id="img1" kinds={["caption"]} /></>, { wrapper: setup(outputs, [], ["translate"]) })
  expect(screen.queryByText("Never captioned")).toBeNull()
  expect(screen.queryByRole("button", { name: "Caption: Missing" })).toBeNull()
  unmount()
  render(<OutputReview {...review} />, { wrapper: setup(outputs, [], []) })
  expect(screen.getByRole("button", { name: "Translation: Out of sync" })).toBeTruthy()
  cleanup()
  render(<><CatalogSummary bookLabel="book" stage="captions" expanded /><OutputReview {...review} id="img1" kinds={["caption"]} /></>, { wrapper: setup(outputs, [], ["captions"]) })
  expect(screen.getByText("Never captioned")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Caption: Missing" })).toBeTruthy()
})

it("AC-15 expanded details retain every reason and linked source", () => {
  const first = status({ identity: { kind: "translation", id: "first-source", language: "fr" }, warnings: [{ reason: "legacy" }], text: "First correction" })
  const second = status({ identity: { kind: "preparation", id: "second-source", language: "fr" }, warnings: [{ reason: "source-changed" }], text: "Second correction" })
  render(<OutputReview {...review} kinds={["audio"]} />, { wrapper: setup([first, second, status({ identity: { kind: "audio", id: "phrase", language: "fr" }, manual: false, warnings: [
    { reason: "legacy" }, { reason: "preparation-failed" }, { reason: "upstream", source: first.identity }, { reason: "upstream", source: second.identity },
  ] })]) })
  fireEvent.click(screen.getByRole("button", { name: "Audio: Needs review" }))
  expect(screen.getByText("Freshness is unknown. Existing content has been kept.")).toBeTruthy()
  expect(screen.getByText("Text preparation failed. Speech text uses the original text.")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Review source" }))
  expect(screen.getByText("First correction")).toBeTruthy()
  expect(screen.getByText("Second correction")).toBeTruthy()
})

it("keeps manual authorship quiet and requires an explicit replacement after opening its actions", async () => {
  render(<OutputReview {...review} />, { wrapper: setup([status()]) })
  expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull()
  const indicator = screen.getByRole("button", { name: "Translation: Edited manually" })
  expect(indicator.textContent).toBe("Manual edit")
  fireEvent.click(indicator)
  fireEvent.click(screen.getByRole("button", { name: "Regenerate", exact: true }))
  expect(calls.run).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Regenerate and replace my edit" }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledWith("book", undefined, expect.objectContaining({ outputScope: {
    selection: { kinds: ["translation"], ids: ["phrase"], languages: ["fr"] },
    replace: [{ identity: status().identity, signature: "inputs", contentHash: "content" }],
  } })))
})

it("shows a draft indicator before Save and keeps replacement unavailable while the draft is dirty", () => {
  render(<OutputReview {...review} edited dirty />, { wrapper: setup([status({ manual: false, protected: false })]) })
  fireEvent.click(screen.getByRole("button", { name: "Translation: Unsaved edit" }))
  expect(screen.getByText("Save or cancel your draft before reviewing outputs.")).toBeTruthy()
  expect(screen.queryByRole("button", { name: /Regenerate/ })).toBeNull()
  expect(calls.run).not.toHaveBeenCalled()
})

const savedSpeech: TTSResponse = { languages: { fr: {
  entries: [{ textId: "phrase", fileName: "phrase.wav", voice: "alloy", model: "tts-1", cached: false, voiceSlot: "primary" }],
  generatedAt: "2026-10-11T00:00:00Z", version: 1,
} } }
// Delete all speech publishes empty current versions while retaining history.
const resetSpeech: TTSResponse = { languages: {
  fr: { entries: [], generatedAt: "2026-10-11T01:00:00Z", version: 2 },
  en: { entries: [], generatedAt: "2026-10-11T01:00:00Z", version: 3 },
} }
const speechVisibilityCases: { name: string; state: StageState; tts?: TTSResponse; visible: boolean }[] = [
  { name: "before speech status loads", state: "idle", visible: false },
  { name: "before the first speech run", state: "idle", tts: { languages: {} }, visible: false },
  { name: "while the first run streams partial output", state: "running", tts: { ...savedSpeech, live: true }, visible: false },
  { name: "after speech completes", state: "done", tts: { languages: {} }, visible: true },
  { name: "after speech fails without producing audio", state: "error", tts: { languages: {} }, visible: true },
  { name: "after a text edit resets stage status but retains audio", state: "idle", tts: savedSpeech, visible: true },
  { name: "after deleting all speech retains only empty current versions", state: "idle", tts: resetSpeech, visible: false },
  { name: "after a text edit retains recorded speech failures", state: "idle", tts: { languages: { fr: {
    ...resetSpeech.languages.fr, failed: [{ textId: "phrase", error: "Provider timed out" }],
  } } }, visible: true },
  { name: "while a rerun is queued", state: "queued", tts: savedSpeech, visible: false },
]

it.each(speechVisibilityCases)("only shows missing speech when relevant: $name", ({ state, tts, visible }) => {
  render(<OutputReview {...review} kinds={["audio", "timestamps"]} showMissing={shouldShowMissingSpeech(state, tts)} />, { wrapper: setup([
    status({ identity: { kind: "audio", id: "phrase", language: "fr" },
      usable: false, current: false, protected: false, manual: false, missing: true }),
    status({ identity: { kind: "timestamps", id: "phrase", language: "fr" },
      usable: false, current: false, protected: false, manual: false, missing: true }),
  ]) })
  expect(!!screen.queryByRole("button", { name: "Audio: No audio" })).toBe(visible)
  expect(!!screen.queryByRole("button", { name: "Timestamps: Missing" })).toBe(visible)
  expect(calls.run).not.toHaveBeenCalled()
})

it("removes missing-audio actions after deleting all speech and restores them after a new run", () => {
  const props = { ...review, kinds: ["audio"] as ["audio"] }
  const { rerender } = render(<OutputReview {...props} showMissing={shouldShowMissingSpeech("done", savedSpeech)} />, { wrapper: setup([
    status({ identity: { kind: "audio", id: "phrase", language: "fr" },
      usable: false, current: false, protected: false, manual: false, missing: true }),
  ]) })
  expect(screen.getByRole("button", { name: "Audio: No audio" })).toBeTruthy()

  rerender(<OutputReview {...props} showMissing={shouldShowMissingSpeech("idle", resetSpeech)} />)
  expect(screen.queryByRole("button", { name: "Audio: No audio" })).toBeNull()

  rerender(<OutputReview {...props} showMissing={shouldShowMissingSpeech("error", resetSpeech)} />)
  expect(screen.getByRole("button", { name: "Audio: No audio" })).toBeTruthy()
})

it("preserves review of existing audio when missing-audio indicators are hidden", () => {
  render(<OutputReview {...review} kinds={["audio"]} showMissing={false} />, { wrapper: setup([status({
    identity: { kind: "audio", id: "phrase", language: "fr" }, manual: false, protected: false,
    current: false, updateNeeded: true,
  })]) })
  expect(screen.getByRole("button", { name: "Audio: Out of sync" })).toBeTruthy()
})

it("offers missing audio after a speech run through a quiet action scoped to one item, locale and voice", async () => {
  render(<OutputReview {...review} kinds={["audio"]} voiceSlot="primary" showMissing={shouldShowMissingSpeech("done")} />, { wrapper: setup([status({
    identity: { kind: "audio", id: "phrase", language: "fr", voiceSlot: "primary" },
    usable: false, current: false, protected: false, manual: false, missing: true,
  })]) })
  expect(screen.queryByText("Missing")).toBeNull()
  expect(screen.queryByRole("button", { name: "Generate selected output" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Audio: No audio" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate selected output" }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledWith("book", undefined, {
    fromStage: "speech", toStage: "speech", outputScope: {
      selection: { kinds: ["audio"], ids: ["phrase"], languages: ["fr"], voiceSlots: ["primary"] },
    },
  }))
})

const stored: CoreTtsCatalogEntry = {
  id: "phrase", displayText: "Chapitre 1", speechText: "Chapitre 1", changed: false,
  transformations: [], status: "ready",
  generation: { mode: "unchanged", generatedAt: "before", enabledTransformations: [], sourceTextHash: "text", contextHash: "context" },
}
const editor = { bookLabel: "book", language: "fr", version: 1, sourceSignature: "source", displayText: stored.displayText }

it("does not introduce a speech area or preparation warning when display text diverges from a pass-through copy", () => {
  const wrapper = setup([status({ identity: { kind: "preparation", id: "phrase", language: "fr" }, warnings: [{ reason: "preparation-outdated" }] })])
  const view = render(<CoreTtsSpeechEditor {...editor} entry={stored} />, { wrapper })
  view.rerender(<CoreTtsSpeechEditor {...editor} displayText="TEST" entry={stored} />)
  expect(screen.queryByText("Chapitre 1")).toBeNull()
  expect(screen.queryByText("Out of sync")).toBeNull()
  expect(screen.queryByText("Text preparation is outdated. Speech text uses the original text.")).toBeNull()
  expect(calls.saveSpeech).not.toHaveBeenCalled()
  // An explicit edit can still create custom speech text, starting from the current display text.
  fireEvent.click(screen.getByRole("button", { name: "Edit speech text" }))
  expect((screen.getByRole("textbox", { name: "Prepared speech text" }) as HTMLTextAreaElement).value).toBe("TEST")
})

it("retains prepared speech verbatim after a display edit and puts the out-of-sync explanation behind its indicator", () => {
  const wrapper = setup([status({ identity: { kind: "preparation", id: "phrase", language: "fr" }, manual: false,
    warnings: [{ reason: "preparation-outdated" }] })])
  const prepared = { ...stored, changed: true, speechText: "Chapitre un", generation: { ...stored.generation, mode: "generated" as const } }
  const view = render(<CoreTtsSpeechEditor {...editor} entry={prepared} />, { wrapper })
  view.rerender(<CoreTtsSpeechEditor {...editor} displayText="TEST" entry={prepared} />)
  expect(screen.getByText("Chapitre un")).toBeTruthy()
  expect(screen.queryByText("TEST")).toBeNull()
  expect(screen.queryByRole("button", { name: "Retry preparation" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Speech text: Out of sync" }))
  expect(screen.getByRole("button", { name: "Retry preparation" })).toBeTruthy()
  expect(calls.saveSpeech).not.toHaveBeenCalled()
})

it("leaves absent preparation absent when display text changes", () => {
  const { container, rerender } = render(<CoreTtsSpeechEditor {...editor} />, { wrapper: setup([]) })
  rerender(<CoreTtsSpeechEditor {...editor} displayText="TEST" />)
  expect(container.textContent).toBe("")
  expect(screen.queryByRole("button", { name: "Edit speech text" })).toBeNull()
  expect(calls.saveSpeech).not.toHaveBeenCalled()
})

it("keeps the reason for an attempted preparation failure available inside its compact details", () => {
  const wrapper = setup([status({ identity: { kind: "preparation", id: "phrase", language: "fr" }, manual: false,
    warnings: [{ reason: "preparation-failed" }] })])
  render(<CoreTtsSpeechEditor {...editor} entry={{ ...stored, status: "failed", failureReason: "Provider timed out",
    generation: { ...stored.generation, mode: "generated" } }} />, { wrapper })
  expect(screen.queryByText("Provider timed out")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Speech text: Needs review" }))
  expect(screen.getByText("Provider timed out")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Retry preparation" })).toBeTruthy()
})

it("blocks header generation while speech text is being edited and restores it on cancel", () => {
  const wrapper = setup([status({ identity: { kind: "audio", id: "phrase", language: "fr", voiceSlot: "primary" },
    usable: false, current: false, protected: false, manual: false, missing: true })])
  function Item() {
    const [editing, setEditing] = React.useState(false)
    const onEditingChange = React.useCallback((_id: string, _language: string, dirty: boolean) => setEditing(dirty), [])
    return <>
      <OutputReview {...review} kinds={["audio"]} dirty={editing} />
      <CoreTtsSpeechEditor {...editor} entry={stored} onEditingChange={onEditingChange} />
    </>
  }
  render(<Item />, { wrapper })
  fireEvent.click(screen.getByRole("button", { name: "Edit speech text" }))
  fireEvent.click(screen.getByRole("button", { name: "Audio: No audio" }))
  expect(screen.queryByRole("button", { name: "Generate selected output" })).toBeNull()
  expect(screen.getByText("Save or cancel your draft before reviewing outputs.")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }))
  expect(screen.getByRole("button", { name: "Generate selected output" })).toBeTruthy()
  expect(calls.run).not.toHaveBeenCalled()
})

it("keeps optional preparation out of Language totals while still surfacing translation warnings", () => {
  const wrapper = setup([
    status({ identity: { kind: "preparation", id: "phrase", language: "fr" }, warnings: [{ reason: "preparation-missing" }] }),
    status({ warnings: [{ reason: "source-changed" }] }),
  ])
  render(<CatalogSummary bookLabel="book" stage="translate" />, { wrapper })
  expect(screen.getByText("Items needing attention: 1")).toBeTruthy()
})


it("requires resolving duplicate retained values rather than offering an ineffective Keep action", () => {
  render(<OutputReview {...review} compact={false} />, { wrapper: setup([status({ warnings: [{ reason: "legacy" }, { reason: "output-conflict", conflictId: "phrase" }] })]) })
  expect(screen.queryByRole("button", { name: "Keep my edit" })).toBeNull()
  expect(screen.getByRole("button", { name: "Regenerate", exact: true })).toBeTruthy()
  expect(screen.getByText(/Multiple retained outputs share this ID/)).toBeTruthy()
})
