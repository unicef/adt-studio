// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { OutputStatus, SectioningSynchronization } from "@adt/types"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.map((s, i) => s + (values[i] ?? "")).join("") }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, params }: { children: React.ReactNode; params: { label: string; step: string; pageId: string } }) => <a href={`/books/${params.label}/${params.step}/${params.pageId}`}>{children}</a> }))
vi.mock("../pipeline-i18n", () => ({ getStageLabelI18n: (stage: string) => stage }))
vi.mock("./BulkOutputReview", () => ({ BulkOutputReview: () => null }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "key" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("./floating-save", () => ({ useFloatingSaveDirtyEntries: () => [] }))
const { getOutputs, reviewOutput, runStages } = vi.hoisted(() => ({ getOutputs: vi.fn(), reviewOutput: vi.fn(), runStages: vi.fn() }))
vi.mock("@/api/client", () => ({ api: { getOutputs, reviewOutput, runStages } }))

import { SectioningSyncNotice } from "./SectioningSyncNotice"
import { OutputReview } from "./OutputReview"

const output: OutputStatus = {
  identity: { kind: "storyboard", id: "pg001" }, signature: "reviewed-input", contentHash: "custom-script-hash",
  usable: true, current: false, protected: true, manual: true, excluded: false, missing: false,
  updateNeeded: false, warnings: [{ reason: "source-changed" }], pageIds: ["pg001"], sectionIds: ["pg001_sec009"],
}
const synchronization: SectioningSynchronization = {
  sourceVersion: 2, renderingVersion: 1, layout: "reflowable", diagnostics: [],
  sections: [{ sectionId: "pg001_sec009", status: "protected-divergence", action: "review", diagnostics: [] }],
}
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  reviewOutput.mockResolvedValue({})
  runStages.mockResolvedValue({})
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})
afterEach(() => { cleanup(); client.clear() })
function view(element: React.ReactNode, outputs = [output]) {
  getOutputs.mockResolvedValue({ outputs })
  client.setQueryData(["books", "book", "outputs", false, undefined], { outputs })
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>)
}
const notice = <SectioningSyncNotice bookLabel="book" pageId="pg001" synchronization={synchronization} />

describe("custom correspondence review through the actual shared output review", () => {
  it("keeps reviewed custom output and provides editor navigation without offering replacement", async () => {
    view(notice)
    expect(screen.getByRole("link", { name: "Open Storyboard" }).getAttribute("href")).toBe("/books/book/storyboard/pg001")
    expect(screen.queryByRole("button", { name: /generate|replace|repair/i })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Keep my edit" }))
    await waitFor(() => expect(reviewOutput).toHaveBeenCalledWith("book", {
      identity: output.identity, signature: output.signature, contentHash: output.contentHash, action: "keep",
    }))
    expect(runStages).not.toHaveBeenCalled()
    // Keep is an acknowledgement, not proof of source/render correspondence.
    // Only the next authoritative page response can dismiss this notice.
    expect(screen.getByRole("status").textContent).toContain("pg001_sec009")
  })

  it("does not offer generic generation even when a generated custom output is stale", () => {
    view(notice, [{ ...output, manual: false, protected: false, updateNeeded: true }])
    expect(screen.getByRole("link", { name: "Open Storyboard" })).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(runStages).not.toHaveBeenCalled()
  })

  it("preserves the restriction when opening upstream review while allowing a checked acknowledgement", async () => {
    const upstream: OutputStatus = {
      ...output, identity: { kind: "preparation", id: "pg001_sec009", language: "en" }, manual: false,
      warnings: [{ reason: "preparation-failed" }],
    }
    view(notice, [{ ...output, warnings: [{ reason: "upstream", source: upstream.identity }] }, upstream])
    fireEvent.click(screen.getByRole("button", { name: "Review source" }))
    expect(screen.queryByRole("button", { name: /generate|replace|retry/i })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Mark checked" }))
    await waitFor(() => expect(reviewOutput).toHaveBeenCalledWith("book", {
      identity: upstream.identity, signature: upstream.signature, contentHash: upstream.contentHash, action: "checked",
    }))
    expect(runStages).not.toHaveBeenCalled()
  })

  it("retains explicitly confirmed replacement in the existing general review flow", async () => {
    view(<OutputReview bookLabel="book" id="pg001" kinds={["storyboard"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    fireEvent.click(screen.getByRole("button", { name: "Regenerate and replace my edit" }))
    await waitFor(() => expect(runStages).toHaveBeenCalledWith("book", "key", expect.objectContaining({
      outputScope: { selection: { kinds: ["storyboard"], ids: ["pg001"] }, replace: [{ identity: output.identity, signature: output.signature, contentHash: output.contentHash }] },
    })))
  })

  it("removes an already-open replacement confirmation when the review becomes retention-only", () => {
    const rendered = view(<OutputReview bookLabel="book" id="pg001" kinds={["storyboard"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    expect(screen.getByRole("button", { name: "Regenerate and replace my edit" })).toBeTruthy()
    rendered.rerender(<QueryClientProvider client={client}><OutputReview bookLabel="book" id="pg001" kinds={["storyboard"]} allowGeneration={false} /></QueryClientProvider>)
    expect(screen.queryByRole("button", { name: /generate|replace/i })).toBeNull()
    expect(runStages).not.toHaveBeenCalled()
  })
})
