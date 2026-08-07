// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/api/client"
import {
  useAssignSignLanguageVideo,
  useDeleteSignLanguageVideo,
  useUploadSignLanguageVideo,
} from "./use-sign-language-videos"

vi.mock("@/api/client", () => ({
  api: {
    uploadSignLanguageVideo: vi.fn(),
    assignSignLanguageVideo: vi.fn(),
    deleteSignLanguageVideo: vi.fn(),
  },
}))

const label = "test-book"

function setup<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const result = renderHook(hook, { wrapper }).result

  return { result, invalidateQueries }
}

async function expectPreviewRefresh(
  invalidateQueries: ReturnType<typeof vi.spyOn>,
  repackageListener: ReturnType<typeof vi.fn>,
) {
  await waitFor(() => {
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["books", label, "sign-language-videos"],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["package-adt-status", label],
    })
    expect(repackageListener).toHaveBeenCalledOnce()
  })
}

describe("sign-language video mutations", () => {
  const repackageListener = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    window.addEventListener("adt:repackage", repackageListener)
  })

  afterEach(() => {
    window.removeEventListener("adt:repackage", repackageListener)
  })

  it("refreshes Preview after uploading a video", async () => {
    vi.mocked(api.uploadSignLanguageVideo).mockResolvedValue({ videoId: "video-1" })
    const { result, invalidateQueries } = setup(() => useUploadSignLanguageVideo(label))

    await act(() => result.current.mutateAsync(new File(["video"], "video.mp4")))

    await expectPreviewRefresh(invalidateQueries, repackageListener)
  })

  it("refreshes Preview after assigning a video", async () => {
    vi.mocked(api.assignSignLanguageVideo).mockResolvedValue({ ok: true })
    const { result, invalidateQueries } = setup(() => useAssignSignLanguageVideo(label))

    await act(() =>
      result.current.mutateAsync({ videoId: "video-1", sectionId: "pg001_sec001" }),
    )

    await expectPreviewRefresh(invalidateQueries, repackageListener)
  })

  it("refreshes Preview after deleting a video", async () => {
    vi.mocked(api.deleteSignLanguageVideo).mockResolvedValue({ ok: true })
    const { result, invalidateQueries } = setup(() => useDeleteSignLanguageVideo(label))

    await act(() => result.current.mutateAsync("video-1"))

    await expectPreviewRefresh(invalidateQueries, repackageListener)
  })
})
