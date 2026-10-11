// @vitest-environment jsdom
import { useState } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useIsMutating } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PromptVersionHistory } from "@/components/pipeline/stages/book/GlobalPromptsSettings/PromptVersionHistory"
import { afterEach, expect, it, vi } from "vitest"
import { api, type PromptResponse } from "@/api/client"
import { PromptViewer } from "./PromptViewer"
import { savePromptDraft } from "./promptDraftSave"
import { toPromptDraft, type PromptDraft } from "./types"

vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: unknown }) => children, useLingui: () => ({ t: (parts: TemplateStringsArray, ...args: unknown[]) => parts.reduce((s, p, i) => s + p + (args[i] ?? ""), "") }) }))
vi.mock("@lingui/core/macro", () => ({ msg: (parts: TemplateStringsArray) => ({ message: parts.join("") }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (value: { message: string }) => value.message } }))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@monaco-editor/react", () => ({ default: ({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { readOnly: boolean } }) => <textarea aria-label="Prompt" value={value} readOnly={options.readOnly} onChange={(event) => onChange(event.target.value)} /> }))
vi.mock("./promptEditor", () => ({ PROMPT_EDITOR_OPTIONS: {}, PROMPT_EDITOR_LANGUAGE: "liquid", configurePromptEditor: () => {}, promptEditorTheme: () => "test" }))
vi.mock("./PromptLiquidGuideDialog", () => ({ PromptLiquidGuideDialog: () => null }))
vi.mock("../ModelSelect", () => ({ LLM_MODEL_GROUPS: [], ModelSelect: () => null }))
vi.mock("@/hooks/use-dark-mode", () => ({ useIsDarkMode: () => false }))
vi.mock("@/hooks/use-effective-default-model", () => ({ useEffectiveDefaultModel: () => "openai:gpt-5.5" }))
vi.mock("@/hooks/use-effective-base-prompt-model", () => ({ useEffectiveBasePromptModel: () => "openai:gpt-5.4" }))
vi.mock("@/api/client", () => ({ api: { getPrompt: vi.fn(), updatePrompt: vi.fn(), listPromptVersions: vi.fn(), setPromptVersionCurrent: vi.fn() }, ApiError: class extends Error {} }))

const initial: PromptResponse = {
  name: "test", resolvedName: "test__openai_gpt_5_5", modelId: "openai:gpt-5.5", content: "original", revision: "a".repeat(64), source: "bundled",
  persistence: { source: "bundled", saveTarget: "book", logicalPath: "prompts/.versions/test__openai_gpt_5_5" },
}
const history = { name: "test", resolvedName: "test", modelId: null,
  currentVersion: null, isFallbackCurrent: true, fallbackContent: "fallback", fallbackResolvedName: "test",
  versions: [{ version: "20260101T000000Z.liquid", content: "old", createdAt: null, isCurrent: false }] }

function historyView(client: QueryClient, disabled = false, onPendingChange?: (pending: boolean) => void) {
  return <QueryClientProvider client={client}><PromptVersionHistory promptName="test"
    modelId={null} revision={initial.revision} currentContent="fallback" editedContent="fallback" disabled={disabled}
    hasUnsavedChanges={false} onCurrentVersionChanged={() => {}} onPendingChange={onPendingChange} /></QueryClientProvider>
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

function setup(model: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(api.getPrompt).mockResolvedValue(initial)
  function Host() {
    const [draft, setDraft] = useState<PromptDraft | null>(null)
    const saving = useIsMutating() > 0
    return <><PromptViewer promptName="test" bookLabel="book" title="Prompt" description="Test" model={model}
      onModelChange={() => {}} draft={draft} onContentChange={(content, modelId, revision) => setDraft(toPromptDraft(content, modelId, revision))} />
      <button onClick={() => { if (draft) void savePromptDraft(client, "test", "book", draft, setDraft) }}>Save</button>
      <output data-testid="draft">{draft?.content ?? "no draft"}</output><output data-testid="saving">{saving ? "saving" : "idle"}</output></>
  }
  return render(<QueryClientProvider client={client}><TooltipProvider><Host /></TooltipProvider></QueryClientProvider>)
}

it("previews the inherited generation model when the stage model is unset", async () => {
  setup("")
  await screen.findByRole("textbox", { name: "Prompt" })
  expect(api.getPrompt).toHaveBeenCalledWith("test", "book", "openai:gpt-5.5")
})

it("keeps a book draft reverted to old server bytes during a pending save", async () => {
  let finish!: (prompt: PromptResponse) => void
  vi.mocked(api.updatePrompt).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  setup("openai:gpt-5.5")
  const editor = await screen.findByRole("textbox", { name: "Prompt" })
  fireEvent.change(editor, { target: { value: "submitted" } })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(api.updatePrompt).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByTestId("saving").textContent).toBe("saving"))
  fireEvent.change(editor, { target: { value: "original" } })
  const saved = { ...initial, content: "submitted", revision: "b".repeat(64) }
  vi.mocked(api.getPrompt).mockResolvedValue(saved)
  await act(async () => { finish(saved) })
  await waitFor(() => expect(screen.getByTestId("draft").textContent).toBe("original"))
  expect((editor as HTMLTextAreaElement).value).toBe("original")
})

it("disables restore for retained history when the parent becomes read-only or busy", async () => {
  const client = new QueryClient()
  vi.mocked(api.listPromptVersions).mockResolvedValue(history)
  const { rerender } = render(historyView(client))
  const restore = await screen.findByRole("button", { name: "Use as current" })
  expect((restore as HTMLButtonElement).disabled).toBe(false)
  rerender(historyView(client, true))
  expect((restore as HTMLButtonElement).disabled).toBe(true)
})

it("reconciles a lost restore response by reading the committed selection before retry", async () => {
  const client = new QueryClient()
  vi.mocked(api.listPromptVersions).mockResolvedValue(history)
  vi.mocked(api.setPromptVersionCurrent).mockRejectedValue(new Error("response lost"))
  const committed = { ...initial, content: "old", revision: "c".repeat(64) }
  vi.mocked(api.getPrompt).mockResolvedValue(committed)
  render(historyView(client))
  fireEvent.click(await screen.findByRole("button", { name: "Use as current" }))
  await waitFor(() => expect(client.getQueryData(["prompts", "test", undefined, null])).toEqual(committed))
  expect(api.setPromptVersionCurrent).toHaveBeenCalledOnce()
  expect(api.getPrompt).toHaveBeenCalledWith("test", undefined, null)
})

it("releases the editor pending state when a history view unmounts during restore", async () => {
  const client = new QueryClient()
  vi.mocked(api.listPromptVersions).mockResolvedValue(history)
  let finish!: (prompt: PromptResponse) => void
  vi.mocked(api.setPromptVersionCurrent).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const pending = vi.fn()
  const { unmount } = render(historyView(client, false, pending))
  fireEvent.click(await screen.findByRole("button", { name: "Use as current" }))
  await waitFor(() => expect(pending).toHaveBeenLastCalledWith(true))
  unmount()
  expect(pending).toHaveBeenLastCalledWith(false)
  await act(async () => { finish(initial) })
})

it("keeps a late restore response scoped to its original book after navigation", async () => {
  const client = new QueryClient()
  vi.mocked(api.listPromptVersions).mockResolvedValue(history)
  let finish!: (prompt: PromptResponse) => void
  vi.mocked(api.setPromptVersionCurrent).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const changed = vi.fn()
  const view = (bookLabel: string) => <QueryClientProvider client={client}><PromptVersionHistory promptName="test"
    bookLabel={bookLabel} modelId={null} revision={initial.revision} currentContent="fallback" editedContent="fallback"
    disabled={false} hasUnsavedChanges={false} onCurrentVersionChanged={changed} /></QueryClientProvider>
  const { rerender } = render(view("first"))
  fireEvent.click(await screen.findByRole("button", { name: "Use as current" }))
  await waitFor(() => expect(api.setPromptVersionCurrent).toHaveBeenCalledOnce())
  rerender(view("second"))
  await act(async () => { finish(initial) })
  await waitFor(() => expect(client.getQueryData(["prompts", "test", "first", null])).toEqual(initial))
  expect(client.getQueryData(["prompts", "test", "second", null])).toBeUndefined()
  expect(changed).not.toHaveBeenCalled()
})
