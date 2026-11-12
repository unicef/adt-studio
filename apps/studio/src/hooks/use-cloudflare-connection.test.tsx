// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const disconnectCloudflare = vi.fn(async () => ({ disconnected: true }))

vi.mock("@/api/client", () => ({
  api: { disconnectCloudflare: (...args: unknown[]) => disconnectCloudflare(...(args as [])) },
}))

const { useDisconnectCloudflare, cloudflareConnectionKey } = await import(
  "./use-cloudflare-connection"
)
const { publicationsKey } = await import("./use-publications")

afterEach(() => disconnectCloudflare.mockClear())

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe("disconnecting a Cloudflare account", () => {
  /**
   * The home and library cards read their Shared badge from the shelf query. Leaving it in the
   * cache meant the badges survived a disconnect — and after "delete everything", they were
   * badges for books that existed nowhere. The author had to reload the app.
   */
  it("forgets everything that was only true while an account was connected", async () => {
    const { client, wrapper } = harness()
    client.setQueryData(cloudflareConnectionKey, { connected: true })
    client.setQueryData(publicationsKey, { publications: [{ token: "t" }] })
    client.setQueryData(["books", "raven", "publication"], { record: {} })
    client.setQueryData(["books", "raven", "publication", "comments"], { comments: [] })
    client.setQueryData(["books", "raven", "publication", "pages"], { pages: [] })
    /** Untouched: it has nothing to do with the account. */
    client.setQueryData(["books", "raven", "pages"], { pages: ["pg001"] })

    const { result } = renderHook(() => useDisconnectCloudflare(), { wrapper })
    result.current.mutate({ credentials: {}, deleteResources: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.getQueryData(cloudflareConnectionKey)).toBeUndefined()
    expect(client.getQueryData(publicationsKey)).toBeUndefined()
    expect(client.getQueryData(["books", "raven", "publication"])).toBeUndefined()
    expect(client.getQueryData(["books", "raven", "publication", "comments"])).toBeUndefined()
    expect(client.getQueryData(["books", "raven", "publication", "pages"])).toBeUndefined()
    expect(client.getQueryData(["books", "raven", "pages"])).toEqual({ pages: ["pg001"] })
  })
})
