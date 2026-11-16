// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { DashThread } from "./dashboard-data"
const state = vi.hoisted(() => ({ sections: [] as {sectionId?: string; sectionIndex: number; html: string}[] }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({children}: {children: React.ReactNode}) => <>{children}</>, useLingui: () => ({ t: (s: TemplateStringsArray) => s.join("") }) }))
vi.mock("@/hooks/use-pages", () => ({ usePage: () => ({ data: { rendering: { sections: state.sections } }, isPending: false }) }))
vi.mock("@/components/pipeline/stages/storyboard/components/BookPreviewFrame", () => ({ BookPreviewFrame: ({html}: {html: string}) => <div data-testid="preview" dangerouslySetInnerHTML={{__html: html}} /> }))
import { FeedbackPage } from "./FeedbackPage"
const thread = { id: "c", pageId: "pg001", pageSectionId: "pg001_sec001", sectionNumber: 1, anchor: null, resolved: false } as DashThread
const view = () => render(<FeedbackPage bookLabel="book" thread={thread} threads={[thread]} onLocate={() => {}} onSelectThread={() => {}} />)
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: true })); state.sections = [{ sectionId: "pg001_sec002", sectionIndex: 0, html: "<p>Neighbor B</p>" }, { sectionId: "pg001_sec001", sectionIndex: 1, html: "<p>Actual owner A</p>" }] })
it("previews the owner despite stale dashboard sectionNumber and different rendering order", () => {
  view()
  expect(screen.getByTestId("preview").textContent).toBe("Actual owner A")
  expect(screen.queryByText("Neighbor B")).toBeNull()
})
it.each(["retired", "ambiguous", "legacy"])("does not preview a neighboring section for %s ownership", stateKind => {
  if (stateKind === "retired") state.sections.pop()
  if (stateKind === "ambiguous") state.sections.push({ ...state.sections[1], sectionIndex: 2 })
  if (stateKind === "legacy") state.sections.forEach(section => { delete section.sectionId })
  view()
  expect(screen.queryByTestId("preview")).toBeNull()
  expect(screen.queryByText("Neighbor B")).toBeNull()
})
