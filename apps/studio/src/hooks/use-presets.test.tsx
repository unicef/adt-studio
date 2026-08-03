// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { api } from "@/api/client"
import { useUploadStyleguide } from "./use-presets"

vi.mock("@/api/client", () => ({
  api: {
    uploadStyleguide: vi.fn(),
  },
}))

describe("useUploadStyleguide", () => {
  it("invalidates the uploaded styleguide preview", async () => {
    vi.mocked(api.uploadStyleguide).mockResolvedValue({ name: "custom" })
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(useUploadStyleguide, { wrapper })

    await act(() =>
      result.current.mutateAsync(
        new File(["# Custom"], "custom.md", { type: "text/markdown" }),
      ),
    )

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["styleguides"],
      })
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["styleguide-preview", "custom"],
      })
    })
  })
})
