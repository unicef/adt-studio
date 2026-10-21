// @vitest-environment jsdom
import { useEffect, type ReactNode } from "react"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { FigureCleanupDialog } from "./FigureCleanupDialog"

const mocks = vi.hoisted(() => ({ generate: vi.fn(), configuredModel: undefined as string | undefined }))
vi.mock("@/api/client", () => ({ BASE_URL: "/api", api: { cleanExtractedImage: mocks.generate } }))
vi.mock("@/hooks/use-pages", () => ({ usePageImage: () => ({ data: { imageBase64: "page" } }) }))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => ({ data: { merged: { default_image_generation_model: mocks.configuredModel } } }) }))
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))
vi.mock("./FigureRegionPicker", () => ({
  FigureRegionPicker: ({ onValidityChange }: { onValidityChange: (valid: boolean) => void }) => {
    useEffect(() => onValidityChange(true), [onValidityChange])
    return null
  },
}))
beforeEach(() => {
  mocks.configuredModel = undefined
  mocks.generate.mockReset().mockImplementation(async (_label, _page, input) => ({
    ...input, imageId: "candidate", cropImageId: "crop", cached: false,
  }))
})
afterEach(cleanup)

function dialog() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <FigureCleanupDialog bookLabel="book" pageId="pg001" imageId="pg001_im001" expectedVersion={1} onClose={() => {}} />
  </QueryClientProvider>)
}

it("defaults to Flare and submits the user's Nano Banana selection, retaining it for retries", async () => {
  const view = dialog()
  expect((view.getByLabelText("Image model") as HTMLSelectElement).value).toBe("openai:gpt-image-2.5-flare")
  fireEvent.change(view.getByLabelText("Image model"), { target: { value: "google:gemini-3.1-flash-image" } })
  fireEvent.click(view.getByRole("button", { name: "Clean selected region" }))
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith("book", "pg001", expect.objectContaining({ modelId: "google:gemini-3.1-flash-image" }), expect.any(AbortSignal)))
  fireEvent.click(await view.findByRole("button", { name: "Adjust and retry" }))
  expect((view.getByLabelText("Image model") as HTMLSelectElement).value).toBe("google:gemini-3.1-flash-image")
  fireEvent.change(view.getByLabelText("Image model"), { target: { value: "openai:gpt-image-2.5-flare" } })
  fireEvent.click(view.getByRole("button", { name: "Clean selected region" }))
  await waitFor(() => expect(mocks.generate).toHaveBeenLastCalledWith("book", "pg001", expect.objectContaining({ modelId: "openai:gpt-image-2.5-flare" }), expect.any(AbortSignal)))
})

it("honors a book override and keeps it available after choosing another model", () => {
  mocks.configuredModel = "google:gemini-3-pro-image"
  const view = dialog()
  const select = view.getByLabelText("Image model") as HTMLSelectElement
  expect(select.value).toBe(mocks.configuredModel)
  fireEvent.change(select, { target: { value: "openai:gpt-image-2.5-flare" } })
  fireEvent.change(select, { target: { value: mocks.configuredModel } })
  expect(select.value).toBe(mocks.configuredModel)
})

it("offers background removal on the current image without a generative prompt or model", async () => {
  const view = dialog()
  fireEvent.click(view.getByRole("radio", { name: "Remove background" }))
  expect(view.queryByLabelText("Cleanup instructions")).toBeNull()
  expect(view.queryByLabelText("Image model")).toBeNull()
  expect((view.getByLabelText("Image to process") as HTMLSelectElement).value).toBe("current-image")
  fireEvent.click(view.getByRole("button", { name: "Remove background" }))
  await waitFor(() => expect(mocks.generate).toHaveBeenCalled())
  expect(mocks.generate.mock.calls[0][2]).toEqual({ sourceImageId: "pg001_im001", expectedVersion: 1,
    operation: "remove-background", inputSource: "current-image" })
  expect(await view.findByRole("img", { name: "Background removed" })).toBeTruthy()
  expect(view.getAllByRole("img")).toHaveLength(2)
})

it("can remove a page crop's background and switch back to generative cleanup on retry", async () => {
  const view = dialog()
  fireEvent.click(view.getByRole("radio", { name: "Remove background" }))
  fireEvent.change(view.getByLabelText("Image to process"), { target: { value: "page-region" } })
  fireEvent.click(view.getByRole("button", { name: "Remove background" }))
  await waitFor(() => expect(mocks.generate).toHaveBeenCalled())
  expect(mocks.generate.mock.calls[0][2]).toMatchObject({ operation: "remove-background", inputSource: "page-region", region: { x: 0, y: 0, width: 100, height: 100 } })
  fireEvent.click(await view.findByRole("button", { name: "Adjust and retry" }))
  fireEvent.click(view.getByRole("radio", { name: "Clean up with AI" }))
  expect(view.getByLabelText("Cleanup instructions")).toBeTruthy()
  expect((view.getByLabelText("Image model") as HTMLSelectElement).value).toBe("openai:gpt-image-2.5-flare")
})
