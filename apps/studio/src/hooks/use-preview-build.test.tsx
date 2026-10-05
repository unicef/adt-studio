// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isPreviewBuildSettled,
  previewBuildNoticeKey,
  usePreviewBuild,
  type PreviewBuildStatus,
} from "./use-preview-build"

vi.mock("@/lib/utils", () => ({ isElectron: () => true }))

function status(overrides: Partial<PreviewBuildStatus> = {}): PreviewBuildStatus {
  return {
    version: "0.8.1-beta-pr-867",
    pullRequest: { number: 867, url: "https://github.com/unicef/adt-studio/pull/867" },
    state: "open",
    ...overrides,
  }
}

function renderFor(version: string) {
  const previewBuild = vi.fn().mockResolvedValue(status({ version, state: "merged" }))
  window.api = { version, updates: { previewBuild } } as unknown as typeof window.api
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { previewBuild, hook: renderHook(() => usePreviewBuild(), { wrapper }) }
}

afterEach(() => {
  delete (window as { api?: unknown }).api
  localStorage.clear()
})

describe("usePreviewBuild", () => {
  it.each(["0.8.0", "0.8.0-beta.1"])("never asks for a preview status on %s", async (version) => {
    const { previewBuild, hook } = renderFor(version)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(previewBuild).not.toHaveBeenCalled()
    expect(hook.result.current).toMatchObject({ status: null, needsAttention: false })
  })

  it("follows the PR of a preview build", async () => {
    const { previewBuild, hook } = renderFor("0.8.1-beta-pr-867")
    await waitFor(() => expect(hook.result.current.needsAttention).toBe(true))
    expect(previewBuild).toHaveBeenCalledOnce()
  })
})

describe("previewBuildNoticeKey", () => {
  it("has nothing to announce while the PR is open", () => {
    expect(previewBuildNoticeKey(null)).toBeNull()
    expect(previewBuildNoticeKey(status())).toBeNull()
  })

  it("announces a merge, again once it ships, and a close", () => {
    const merged = previewBuildNoticeKey(status({ state: "merged" }))
    const shipped = previewBuildNoticeKey(status({ state: "merged", shippedIn: "0.8.1-beta.1" }))
    expect(merged).not.toBeNull()
    expect(shipped).not.toBe(merged)
    expect(previewBuildNoticeKey(status({ state: "closed" }))).not.toBeNull()
  })
})

describe("isPreviewBuildSettled", () => {
  it("stops polling once the PR shipped or closed, and keeps going until then", () => {
    expect(isPreviewBuildSettled(status())).toBe(false)
    expect(isPreviewBuildSettled(status({ state: "merged" }))).toBe(false)
    expect(isPreviewBuildSettled(status({ state: "merged", shippedIn: "0.8.1-beta.1" }))).toBe(true)
    expect(isPreviewBuildSettled(status({ state: "closed" }))).toBe(true)
  })
})
