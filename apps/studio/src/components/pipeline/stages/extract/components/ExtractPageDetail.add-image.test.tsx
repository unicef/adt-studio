// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const translate = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/core/macro", () => ({ msg: (s: TemplateStringsArray, ...v: unknown[]) => ({message: translate(s, ...v)}) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({children}: {children: ReactNode}) => <>{children}</>, useLingui: () => ({t: translate, i18n: {_: (d: {message: string}) => d.message}}) }))
vi.mock("../../../components/floating-save", () => ({useFloatingSave: () => {}, PendingChip: ({children}: {children: ReactNode}) => <>{children}</>}))
vi.mock("@/components/ui/sonner", () => ({toast: {success: vi.fn(), error: vi.fn()}}))
vi.mock("@/hooks/use-pages", () => ({ usePage: () => ({data: currentPage, isLoading: false}), usePageImage: () => ({data: {imageBase64: "PAGE"}}) }))
vi.mock("@/hooks/use-debug", () => ({useActiveConfig: () => ({})}))
vi.mock("@/hooks/use-api-key", () => ({useApiKey: () => ({}), useBookStructuredTextAvailability: () => false}))
vi.mock("@/hooks/use-book-run", () => ({useBookRun: () => ({stageState: () => "idle", stepState: () => "idle"})}))
// Stand-in crop dialog: "Apply crop" hands a blob to onApply like the real one,
// which swallows the rejection and stays open for a retry.
vi.mock("@/components/pipeline/stages/storyboard/components/ImageCropDialog", () => ({
  ImageCropDialog: ({imageSrc, onApply}: {imageSrc: string; onApply: (blob: Blob) => Promise<void>}) => (
    <div data-testid="crop-dialog" data-src={imageSrc}>
      <button type="button" onClick={() => { void onApply(new Blob(["crop"])).catch(() => {}) }}>Apply crop</button>
    </div>
  ),
  pageBoundsToCropRect: vi.fn(),
}))
vi.mock("@/components/pipeline/stages/storyboard/components/SegmentPreviewDialog", () => ({ SegmentPreviewDialog: () => null }))
vi.mock("@/api/client", () => ({BASE_URL: "", api: {
  updateImageClassification: vi.fn(),
  listBookImages: vi.fn(),
  uploadNewImage: vi.fn(),
  uploadCroppedImage: vi.fn(),
  getVersionHistory: vi.fn(),
  restoreVersion: vi.fn(),
}}))
const {api} = await import("@/api/client")
const {ExtractPageDetail} = await import("./ExtractPageDetail")
let client: QueryClient
const page = {
  pageNumber: 1,
  pageId: "pg001",
  imagesMeta: [],
  versions: {imageClassification: 2},
  imageClassification: {images: [
    {imageId: "pg001_page", isPruned: true, reason: "full-page render"},
    {imageId: "pg001_im001", isPruned: false},
    {imageId: "pg001_im002", isPruned: true, reason: "manual"},
  ]},
}
// A fully scanned page: extraction found no images, only the full-page render.
const scannedPage = {...page, imageClassification: {images: [{imageId: "pg001_page", isPruned: true, reason: "full-page render"}]}}
let currentPage: typeof page = page
function setup() {
  client = new QueryClient({defaultOptions: {queries: {retry: false}}})
  return render(<QueryClientProvider client={client}><ExtractPageDetail bookLabel="book" pageId="pg001" /></QueryClientProvider>)
}
function openAddDialog() {
  fireEvent.click(screen.getByRole("button", {name: "Add image"}))
}
beforeEach(() => {
  vi.clearAllMocks()
  currentPage = page
  vi.mocked(api.updateImageClassification).mockResolvedValue({version: 3})
})
afterEach(() => { cleanup(); client?.clear() })

it("adds an image picked from the book, offering only images not already on the page", async () => {
  vi.mocked(api.listBookImages).mockResolvedValue({images: [
    {imageId: "pg001_im001", pageId: "pg001", width: 100, height: 100, source: "extract"},
    {imageId: "pg001_im002", pageId: "pg001", width: 100, height: 100, source: "extract"},
    {imageId: "pg003_page", pageId: "pg003", width: 800, height: 1000, source: "page"},
    {imageId: "pg003_im001", pageId: "pg003", width: 200, height: 150, source: "extract"},
  ]})
  setup()
  openAddDialog()
  fireEvent.click(screen.getByRole("button", {name: /Pick from book/}))
  const candidate = await screen.findByRole("button", {name: /pg003_im001/})
  // Already on this page (kept or pruned) and full-page renders are not offered.
  expect(screen.queryByRole("button", {name: /pg001_im001/})).toBeNull()
  expect(screen.queryByRole("button", {name: /pg001_im002/})).toBeNull()
  expect(screen.queryByRole("button", {name: /pg003_page/})).toBeNull()
  fireEvent.click(candidate)
  await act(async () => { fireEvent.click(screen.getByRole("button", {name: "Add Image"})) })
  expect(api.updateImageClassification).toHaveBeenCalledWith("book", "pg001", {images: [
    ...page.imageClassification.images,
    {imageId: "pg003_im001", isPruned: false},
  ]})
})

it("uploads a file and adds it to the page's images", async () => {
  vi.mocked(api.uploadNewImage).mockResolvedValue({imageId: "pg001_upload1", width: 40, height: 30})
  const createObjectURL = vi.fn(() => "blob:preview")
  Object.assign(URL, {createObjectURL, revokeObjectURL: vi.fn()})
  const {container} = setup()
  openAddDialog()
  fireEvent.click(screen.getByRole("button", {name: /Upload image/}))
  const file = new File(["png"], "figure.png", {type: "image/png"})
  fireEvent.change(container.querySelector("input[type=file]")!, {target: {files: [file]}})
  await act(async () => { fireEvent.click(screen.getByRole("button", {name: "Add Image"})) })
  expect(api.uploadNewImage).toHaveBeenCalledWith("book", "pg001", file)
  expect(api.updateImageClassification).toHaveBeenCalledWith("book", "pg001", {images: [
    ...page.imageClassification.images,
    {imageId: "pg001_upload1", isPruned: false},
  ]})
})

it("crops a new image from this page, keeping the crop open to retry when saving fails", async () => {
  vi.mocked(api.uploadCroppedImage)
    .mockResolvedValueOnce({imageId: "pg001_crop1", width: 50, height: 50})
    .mockResolvedValueOnce({imageId: "pg001_crop2", width: 50, height: 50})
  vi.mocked(api.updateImageClassification).mockRejectedValueOnce(new Error("Save failed"))
  setup()
  openAddDialog()
  fireEvent.click(screen.getByRole("button", {name: /Crop from page/}))
  expect(screen.getByTestId("crop-dialog").getAttribute("data-src")).toBe("data:image/png;base64,PAGE")

  await act(async () => { fireEvent.click(screen.getByRole("button", {name: "Apply crop"})) })
  expect(api.uploadCroppedImage).toHaveBeenCalledWith("book", "pg001", "pg001", expect.any(Blob))
  expect(screen.getByText("Save failed")).toBeTruthy()
  expect(screen.getByTestId("crop-dialog")).toBeTruthy()

  await act(async () => { fireEvent.click(screen.getByRole("button", {name: "Apply crop"})) })
  expect(api.updateImageClassification).toHaveBeenLastCalledWith("book", "pg001", {images: [
    ...page.imageClassification.images,
    {imageId: "pg001_crop2", isPruned: false},
  ]})
  await waitFor(() => expect(screen.queryByTestId("crop-dialog")).toBeNull())
})

it("offers cropping on a scanned page with no extracted images", async () => {
  currentPage = scannedPage
  vi.mocked(api.uploadCroppedImage).mockResolvedValue({imageId: "pg001_crop1", width: 50, height: 50})
  setup()
  openAddDialog()
  fireEvent.click(screen.getByRole("button", {name: /Crop from page/}))
  await act(async () => { fireEvent.click(screen.getByRole("button", {name: "Apply crop"})) })
  expect(api.updateImageClassification).toHaveBeenCalledWith("book", "pg001", {images: [
    ...scannedPage.imageClassification.images,
    {imageId: "pg001_crop1", isPruned: false},
  ]})
})
