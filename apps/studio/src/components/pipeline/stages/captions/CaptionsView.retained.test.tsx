// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "") }),
}))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: [{ pageId: "pg001", pageNumber: 1, imageCount: 1, hasCaptioning: true, sectionCount: 1 }], isLoading: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "idle", queueRun: vi.fn() }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({}), useBookStructuredTextAvailability: () => false }))
vi.mock("@/routes/books.$label", () => ({ useSectionNav: () => ({ sectionIndex: 0, setSectionIndex: vi.fn() }) }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ setExtra: vi.fn() }) }))
vi.mock("@tanstack/react-query", () => ({ useQueries: () => [{ data: { imageCaptioning: { captions: [{ imageId: "pg001_im001", caption: "Retained hand edit", source: "manual" }] } }, isLoading: false }] }))
vi.mock("../../components/StageRunCard", () => ({ StageRunCard: () => <p>Generate captions</p> }))
vi.mock("./components/CaptionsHintBanner", () => ({ CaptionsHintBanner: () => null }))
vi.mock("./components/PageJumper", () => ({ PageJumper: () => null }))
vi.mock("./components/PageCaptions", () => ({ PageCaptions: ({ pageId }: { pageId: string }) => <p>Saved caption editor {pageId}</p> }))

afterEach(cleanup)
it("keeps the caption editor visible when upstream work clears only the attempt status", async () => {
  const { CaptionsView } = await import("./CaptionsView")
  render(<CaptionsView bookLabel="retained" />)
  expect(screen.getByText("Saved caption editor pg001")).toBeTruthy()
  expect(screen.queryByText("Generate captions")).toBeNull()
})
