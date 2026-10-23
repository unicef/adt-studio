// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const translate = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
const state = vi.hoisted(() => ({ stay: async () => {}, dirty: false }))
vi.mock("@lingui/core/macro", () => ({ msg: (s: TemplateStringsArray, ...v: unknown[]) => ({message: translate(s, ...v)}) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({children}: {children: ReactNode}) => <>{children}</>, useLingui: () => ({t: translate, i18n: {_: (d: {message: string}) => d.message}}) }))
vi.mock("../../../components/floating-save", () => ({useFloatingSave: (entry: {onSaveStay: () => Promise<void>; dirty: boolean}) => {state.stay = entry.onSaveStay; state.dirty = entry.dirty}, PendingChip: ({children}: {children: ReactNode}) => <>{children}</>}))
vi.mock("@/components/ui/sonner", () => ({toast: {success: vi.fn(), error: vi.fn()}}))
vi.mock("@/hooks/use-pages", () => ({ usePage: () => ({data: page, isLoading: false}), usePageImage: () => ({}) }))
vi.mock("@/hooks/use-debug", () => ({useActiveConfig: () => ({})}))
vi.mock("@/hooks/use-api-key", () => ({useApiKey: () => ({}), useBookStructuredTextAvailability: () => false}))
vi.mock("@/hooks/use-book-run", () => ({useBookRun: () => ({stageState: () => "idle", stepState: () => "idle"})}))
vi.mock("@/components/pipeline/stages/storyboard/components/ImageCropDialog", () => ({ ImageCropDialog: () => null, pageBoundsToCropRect: vi.fn() }))
vi.mock("@/components/pipeline/stages/storyboard/components/SegmentPreviewDialog", () => ({ SegmentPreviewDialog: () => null }))
vi.mock("@/api/client", () => ({BASE_URL: "", api: {updateImageClassification: vi.fn(), getVersionHistory: vi.fn(), restoreVersion: vi.fn()}}))
const {api} = await import("@/api/client")
const {ExtractPageDetail} = await import("./ExtractPageDetail")
let client: QueryClient
const page = {pageNumber: 1, pageId: "pg001", imagesMeta: [], versions: {imageClassification: 2}, imageClassification: {images: [{imageId: "img001", isPruned: false}]}}
function setup() {
  client = new QueryClient({defaultOptions: {queries: {retry: false}}})
  return render(<QueryClientProvider client={client}><ExtractPageDetail bookLabel="book" pageId="pg001" /></QueryClientProvider>)
}
beforeEach(() => vi.clearAllMocks())
afterEach(() => { cleanup(); client?.clear() })
it("retains manual image selection after failed save, ignores overlaps, and retries the same selection", async () => {
  let fail!: () => void
  vi.mocked(api.updateImageClassification).mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = () => reject(new Error("Image save failed"))})).mockResolvedValue({} as never)
  setup()
  fireEvent.click(screen.getByTitle("Prune image"))
  let saved!: Promise<void>
  await act(async () => { saved = state.stay(); void saved.catch(() => {}) })
  const toggle = screen.getByTitle("Unprune image") as HTMLButtonElement
  expect(toggle.matches(":disabled")).toBe(true)
  fireEvent.click(toggle)
  expect(screen.getByTitle("Unprune image")).toBeTruthy()
  await act(async () => {fail(); await expect(saved).rejects.toThrow("Image save failed")})
  expect(screen.getByRole("alert").textContent).toContain("Image save failed")
  expect(state.dirty).toBe(true)
  expect((screen.getByTitle("Unprune image") as HTMLButtonElement).matches(":disabled")).toBe(false)
  await act(async () => {await state.stay()})
  expect(api.updateImageClassification).toHaveBeenLastCalledWith("book", "pg001", {images: [{imageId: "img001", isPruned: true, reason: "manual"}]})
})
it("blocks image selection during a real restore and retains pre-restore selection on failure", async () => {
  let fail!: () => void
  vi.mocked(api.getVersionHistory).mockResolvedValue({versions: [{version: 2, data: page.imageClassification}, {version: 1, data: page.imageClassification}]})
  vi.mocked(api.restoreVersion).mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = () => reject(new Error("Restore failed"))}))
  setup()
  fireEvent.click(screen.getByTitle("Prune image"))
  fireEvent.click(screen.getByRole("button", {name: /^v\s*2$/}))
  fireEvent.click(await screen.findByRole("button", {name: /^v\s*1/}))
  expect((screen.getByTitle("Unprune image") as HTMLButtonElement).matches(":disabled")).toBe(true)
  fireEvent.click(screen.getByTitle("Unprune image"))
  await act(async () => fail())
  expect(screen.getByTitle("Unprune image")).toBeTruthy()
  expect(state.dirty).toBe(true)
  expect((screen.getByTitle("Unprune image") as HTMLButtonElement).matches(":disabled")).toBe(false)
})
