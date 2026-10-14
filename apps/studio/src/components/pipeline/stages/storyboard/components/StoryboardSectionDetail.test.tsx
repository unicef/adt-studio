// @vitest-environment jsdom
import React, { type ComponentProps } from "react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { i18n } from "@lingui/core"
import type { PageDetail } from "@/api/client"
import type { SectionEditPanel } from "./SectionEditPanel"
import type { StyleEditorPanel } from "./style-editor"

const state = vi.hoisted(() => ({
  panel: null as unknown as ComponentProps<typeof SectionEditPanel>,
  style: null as unknown as ComponentProps<typeof StyleEditorPanel>,
  save: vi.fn().mockResolvedValue({}),
  generate: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (s: TemplateStringsArray, ...v: unknown[]) =>
      s.reduce((r, x, i) => r + x + (v[i] ?? ""), ""),
  }),
}))
vi.mock("@lingui/core/macro", () => ({
  msg: (s: TemplateStringsArray) => ({ id: s.join("") }),
}))
vi.mock("@/api/client", () => ({
  BASE_URL: "/api",
  api: { saveStoryboard: state.save, reRenderPage: state.generate },
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}))
vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({}),
  useBookStructuredTextAvailability: () => true,
  useBookAgentAvailability: () => false,
}))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => ({}) }))
vi.mock("@/hooks/use-pages", () => ({ usePage: () => ({}) }))
vi.mock("@/hooks/use-book-tasks", () => ({
  useBookTasks: () => ({ tasks: [] }),
}))
vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({ stageState: () => "done" }),
}))
vi.mock("@/hooks/use-page-mutations", () => ({
  invalidateStoryboardDependents: vi.fn(),
}))
vi.mock("../../../components/StepViewRouter", () => ({
  useStepHeader: () => ({ headerSlotEl: null }),
}))
vi.mock("@/hooks/use-editable-activities", () => ({
  useActivityStructure: () => ({}),
  useEditableActivities: () => ({}),
  useConvertEditableActivity: () => ({}),
  useSetEditableActivityPresentation: () => ({}),
}))
vi.mock("./SectionEditPanel", () => ({
  SectionEditPanel: (props: ComponentProps<typeof SectionEditPanel>) => {
    state.panel = props
    return null
  },
}))
vi.mock("./style-editor", () => ({
  StyleEditorPanel: (props: ComponentProps<typeof StyleEditorPanel>) => {
    state.style = props
    return null
  },
}))
vi.mock("./BookPreviewFrame", async () => {
  const { forwardRef, useImperativeHandle } = await import("react")
  return {
    BookPreviewFrame: forwardRef(({ html }: { html: string }, ref) => {
      useImperativeHandle(
        ref,
        () => ({
          setElementClasses(id: string, classes: string[]) {
            const doc = new DOMParser().parseFromString(html, "text/html")
            doc
              .querySelector(`[data-id="${id}"]`)
              ?.setAttribute("class", classes.join(" "))
            return doc.body.innerHTML
          },
          refreshCss() {},
          getComputedTypographyStyles() {
            return null
          },
        }),
        [html]
      )
      return null
    }),
  }
})
vi.mock("./AddImageDialog", () => ({
  AddImageDialog: ({
    onSelectExisting,
  }: {
    onSelectExisting: (ids: string[]) => void
  }) => (
    <button onClick={() => onSelectExisting(["new-image"])}>
      Select fixture image
    </button>
  ),
}))
vi.mock("./AiEditHistoryDrawer", () => ({ AiEditHistoryDrawer: () => null }))
vi.mock("./EditableActivityPanel", () => ({
  EditableActivityPanel: () => null,
}))
vi.mock("./ClassicActivityPanel", () => ({ ClassicActivityPanel: () => null }))
vi.mock("./ImageCropDialog", () => ({
  ImageCropDialog: () => null,
  pageBoundsToCropRect: vi.fn(),
}))
vi.mock("./AiImageDialog", () => ({ AiImageDialog: () => null }))
vi.mock("./ReplaceFromBookDialog", () => ({
  ReplaceFromBookDialog: () => null,
}))
vi.mock("./SegmentPreviewDialog", () => ({ SegmentPreviewDialog: () => null }))
vi.mock("./LayoutMirrorDialog", () => ({ LayoutMirrorDialog: () => null }))
vi.mock("./GenerateActivityDialog", () => ({
  GenerateActivityDialog: () => null,
}))

import { FloatingSaveProvider } from "../../../components/floating-save"
import { StoryboardSectionDetail } from "./StoryboardSectionDetail"

function fixture(): PageDetail {
  const section = {
    sectionId: "pg001_sec001",
    sectionType: "text",
    backgroundColor: "white",
    textColor: "black",
    pageNumber: 1,
    isPruned: false,
    nodes: [
      { nodeId: "keep", role: "body_text", isPruned: false, text: "Keep me" },
      {
        nodeId: "retire",
        role: "body_text",
        isPruned: false,
        text: "Exclude me",
      },
    ],
  }
  return {
    pageId: "pg001",
    pageNumber: 1,
    versions: { sectioning: 1, rendering: 1 },
    sectioningTree: { reasoning: "fixture", sections: [section] },
    rendering: {
      sections: [
        {
          sectionId: section.sectionId,
          sectionIndex: 0,
          sectionType: "text",
          reasoning: "fixture",
          html: '<section data-section-id="pg001_sec001"><p data-id="keep">Keep me</p><p data-id="retire">Exclude me</p></section>',
        },
        {
          sectionId: "pg001_sec002",
          sectionIndex: 1,
          sectionType: "activity_custom",
          reasoning: "neighbor",
          html: '<section data-section-id="pg001_sec002">Unchanged neighbor</section>',
          activityAnswers: { answer: "manual" },
        },
      ],
    },
  } as PageDetail
}
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn()
  i18n.load("en", {})
  i18n.activate("en")
  vi.clearAllMocks()
  state.save.mockResolvedValue({})
})
afterEach(cleanup)

it.each([false, true])(
  "floating Save combines exclusions, new image and unflushed style; failed first save=%s",
  async (failFirst) => {
    const page = fixture()
    render(
      <FloatingSaveProvider>
        <StoryboardSectionDetail
          bookLabel="fixture"
          pageId="pg001"
          sectionIndex={0}
          page={page}
        />
      </FloatingSaveProvider>
    )
    act(() => {
      const section = state.panel.section
      state.panel.onSectionChange({
        ...section,
        nodes: section.nodes
          .map((n) => (n.nodeId === "retire" ? { ...n, isPruned: true } : n))
          .concat({
            nodeId: "new-text",
            role: "body_text",
            text: "New source draft",
            isPruned: false,
          }),
      })
      state.panel.onStructuralChange?.()
    })
    act(() => state.panel.onAddImage())
    fireEvent.click(screen.getByText("Select fixture image"))
    act(() => state.style.onClassesChange("keep", ["text-blue-600"]))
    if (failFirst)
      state.save.mockRejectedValueOnce(
        new Error("Conflict: saved version changed")
      )
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
    const payload = state.save.mock.calls[0][2]
    const html = new DOMParser().parseFromString(
      payload.rendering.sections[0].html,
      "text/html"
    )
    expect(html.querySelector('[data-id="retire"]')).toBeNull()
    expect(html.querySelector('[data-id="keep"]')?.className).toBe(
      "text-blue-600"
    )
    expect(html.querySelector('[data-id="new-image"]')).not.toBeNull()
    expect(payload.sectioning.sections[0].nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "retire", isPruned: true }),
        expect.objectContaining({
          nodeId: "new-text",
          text: "New source draft",
        }),
        expect.objectContaining({ nodeId: "new-image", role: "image" }),
      ])
    )
    expect(payload.rendering.sections[1]).toEqual(page.rendering!.sections[1])
    expect(payload.renderingInSync).toBe(false)
    expect(state.generate).not.toHaveBeenCalled()
    if (failFirst) {
      await screen.findByText("Conflict: saved version changed")
      fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
      await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2))
      expect(state.save.mock.calls[1][2]).toEqual(payload)
    }
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save", exact: true })
      ).toBeNull()
    )
  }
)

// The section-only path and an already-absent element are distinct from the
// mixed floating-save regression above: neither may lose a queued style edit.
it.each([false, true])(
  "prune-only Save handles already absent HTML=%s",
  async (alreadyAbsent) => {
    const page = fixture()
    if (alreadyAbsent)
      page.rendering!.sections[0].html =
        page.rendering!.sections[0].html.replace(
          '<p data-id="retire">Exclude me</p>',
          ""
        )
    render(
      <FloatingSaveProvider>
        <StoryboardSectionDetail
          bookLabel="fixture"
          pageId="pg001"
          sectionIndex={0}
          page={page}
        />
      </FloatingSaveProvider>
    )
    act(() =>
      state.panel.onSectionChange({
        ...state.panel.section,
        nodes: state.panel.section.nodes.map((n) =>
          n.nodeId === "retire" ? { ...n, isPruned: true } : n
        ),
      })
    )
    if (alreadyAbsent)
      act(() => state.style.onClassesChange("keep", ["text-blue-600"]))
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
    const payload = state.save.mock.calls[0][2]
    const doc = new DOMParser().parseFromString(
      payload.rendering.sections[0].html,
      "text/html"
    )
    expect(doc.querySelector('[data-id="retire"]')).toBeNull()
    expect(doc.querySelector('[data-id="keep"]')?.textContent).toBe("Keep me")
    if (alreadyAbsent)
      expect(doc.querySelector('[data-id="keep"]')?.className).toBe(
        "text-blue-600"
      )
    expect(payload.rendering.sections[1]).toEqual(page.rendering!.sections[1])
    expect(state.generate).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save", exact: true })
      ).toBeNull()
    )
  }
)

it("pruning a repeated image removes all local references and preserves the neighboring section", async () => {
  const page = fixture()
  page.rendering!.sections[1].html =
    '<section data-section-id="pg001_sec002"><img data-id="new-image">Shared neighbor</section>'
  render(
    <FloatingSaveProvider>
      <StoryboardSectionDetail
        bookLabel="fixture"
        pageId="pg001"
        sectionIndex={0}
        page={page}
      />
    </FloatingSaveProvider>
  )
  for (let count = 0; count < 2; count++) {
    act(() => state.panel.onAddImage())
    fireEvent.click(screen.getByText("Select fixture image"))
  }
  act(() =>
    state.panel.onSectionChange({
      ...state.panel.section,
      nodes: state.panel.section.nodes.map((n) =>
        n.nodeId === "new-image" ? { ...n, isPruned: true } : n
      ),
    })
  )
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  const payload = state.save.mock.calls[0][2]
  const doc = new DOMParser().parseFromString(
    payload.rendering.sections[0].html,
    "text/html"
  )
  expect(payload.sectioning.sections[0].nodes).toContainEqual(
    expect.objectContaining({ nodeId: "new-image", isPruned: true })
  )
  expect(payload.rendering.sections[1]).toEqual(page.rendering!.sections[1])
  expect(doc.querySelectorAll('[data-id="new-image"]')).toHaveLength(0)
  expect(doc.querySelector('[data-id="keep"]')?.textContent).toBe("Keep me")
  expect(state.generate).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Save", exact: true })
    ).toBeNull()
  )
})
