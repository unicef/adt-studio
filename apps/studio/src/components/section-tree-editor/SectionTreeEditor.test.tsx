// @vitest-environment jsdom
import React, { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PageSectioningSection } from "@adt/types"
import { SectionTreeEditor, TREE_DRAG_TYPE } from "./SectionTreeEditor"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce(
        (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
        ""
      )
    },
  }),
}))

vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: () => null,
}))

const initialSection: PageSectioningSection = {
  sectionId: "section-1",
  sectionType: "standard",
  backgroundColor: "#ffffff",
  textColor: "#000000",
  pageNumber: 1,
  isPruned: false,
  nodes: [
    { nodeId: "snake-image", role: "image", isPruned: false },
    {
      nodeId: "rescue-group",
      structure: "group",
      isPruned: false,
      children: [
        { nodeId: "rescue-text", role: "text", text: "Rescue", isPruned: false },
      ],
    },
    {
      nodeId: "sense-group",
      structure: "group",
      isPruned: false,
      children: [
        { nodeId: "sense-text", role: "text", text: "Sense", isPruned: false },
      ],
    },
    { nodeId: "dog-image", role: "image", isPruned: false },
  ],
}

function createDataTransfer() {
  const values = new Map<string, string>()
  return {
    effectAllowed: "none",
    dropEffect: "none",
    get types() {
      return [...values.keys()]
    },
    setData(type: string, value: string) {
      values.set(type, value)
    },
    getData(type: string) {
      return values.get(type) ?? ""
    },
  }
}

function Harness({
  onStructuralChange,
  initial = initialSection,
}: {
  onStructuralChange: () => void
  initial?: PageSectioningSection
}) {
  const [section, setSection] = useState(initial)
  return (
    <SectionTreeEditor
      section={section}
      onChange={setSection}
      bookLabel="test-book"
      onStructuralChange={onStructuralChange}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("SectionTreeEditor drag and drop", () => {
  it("moves an image leaf between content groups and keeps the paired reading order", async () => {
    const onStructuralChange = vi.fn()
    render(<Harness onStructuralChange={onStructuralChange} />)

    const dogImage = screen.getByAltText("dog-image")
    const dragHandle = dogImage.parentElement?.querySelector<HTMLElement>(
      '[title="Drag to move"]'
    )
    expect(dragHandle).toBeTruthy()

    const dataTransfer = createDataTransfer()
    fireEvent.dragStart(dragHandle!, { dataTransfer })
    expect(dataTransfer.getData(TREE_DRAG_TYPE)).toBe("dog-image")
    expect(dogImage.parentElement?.className).toContain("opacity-30")

    await waitFor(() => {
      const editor = screen.getByTestId("section-tree-editor")
      const rootDropZones = Array.from(
        editor.querySelectorAll<HTMLElement>("div.relative.h-2.flex.items-center")
      ).filter(
        (zone) =>
          zone.parentElement === editor || zone.parentElement?.parentElement === editor
      )
      expect(rootDropZones).toHaveLength(initialSection.nodes.length + 1)

      // Place the dog image immediately before Rescue, leaving each image
      // adjacent to the text group it illustrates.
      fireEvent.dragOver(rootDropZones[1], { dataTransfer })
      fireEvent.drop(rootDropZones[1], { dataTransfer })
    })

    await waitFor(() => {
      const editor = screen.getByTestId("section-tree-editor")
      const rootIds = Array.from(editor.children)
        .flatMap((element) => Array.from(element.querySelectorAll("img")))
        .map((image) => image.getAttribute("alt"))
      expect(rootIds).toEqual(["snake-image", "dog-image"])
      expect(onStructuralChange).toHaveBeenCalledTimes(1)
      expect(screen.getByAltText("dog-image").parentElement?.className).not.toContain("opacity-30")
    })

    const editorText = screen.getByTestId("section-tree-editor").textContent ?? ""
    expect(editorText.indexOf("dog-image")).toBeLessThan(editorText.indexOf("Rescue"))
    expect(editorText.indexOf("Rescue")).toBeLessThan(editorText.indexOf("Sense"))
  })

  it("moves an image-and-caption container as one reading-order unit", async () => {
    const pairedSection: PageSectioningSection = {
      ...initialSection,
      nodes: [
        { nodeId: "page-heading", role: "heading", text: "Atmosphere", isPruned: false },
        {
          nodeId: "weather-image-group",
          structure: "image_group",
          isPruned: false,
          children: [
            { nodeId: "weather-image", role: "image", isPruned: false },
            { nodeId: "weather-caption", role: "caption", text: "Blue atmosphere", isPruned: false },
          ],
        },
        {
          nodeId: "body-group",
          structure: "group",
          isPruned: false,
          children: [
            { nodeId: "body-text", role: "text", text: "Main explanation", isPruned: false },
          ],
        },
        {
          nodeId: "question-sidebar",
          structure: "sidebar",
          isPruned: false,
          children: [
            { nodeId: "question-text", role: "text", text: "Big Question", isPruned: false },
          ],
        },
      ],
    }
    const onStructuralChange = vi.fn()
    render(
      <Harness
        initial={pairedSection}
        onStructuralChange={onStructuralChange}
      />
    )

    const editor = screen.getByTestId("section-tree-editor")
    const image = screen.getByAltText("weather-image")
    const imageGroupWrapper = Array.from(editor.children).find((element) =>
      element.contains(image)
    )
    const dragHandle = imageGroupWrapper?.querySelector<HTMLElement>(
      '[title="Drag to move"]'
    )
    expect(dragHandle).toBeTruthy()

    const dataTransfer = createDataTransfer()
    fireEvent.dragStart(dragHandle!, { dataTransfer })
    expect(dataTransfer.getData(TREE_DRAG_TYPE)).toBe("weather-image-group")

    await waitFor(() => {
      const rootDropZones = Array.from(
        editor.querySelectorAll<HTMLElement>("div.relative.h-2.flex.items-center")
      ).filter(
        (zone) =>
          zone.parentElement === editor || zone.parentElement?.parentElement === editor
      )
      expect(rootDropZones).toHaveLength(pairedSection.nodes.length + 1)
      fireEvent.dragOver(rootDropZones[3], { dataTransfer })
      fireEvent.drop(rootDropZones[3], { dataTransfer })
    })

    await waitFor(() => {
      const text = editor.textContent ?? ""
      expect(text.indexOf("Main explanation")).toBeLessThan(
        text.indexOf("weather-image")
      )
      expect(text.indexOf("weather-image")).toBeLessThan(
        text.indexOf("Blue atmosphere")
      )
      expect(text.indexOf("Blue atmosphere")).toBeLessThan(
        text.indexOf("Big Question")
      )
      expect(onStructuralChange).toHaveBeenCalledTimes(1)
    })
  })
})

describe("SectionTreeEditor inherited prune (#596)", () => {
  const hiddenGroupSection: PageSectioningSection = {
    ...initialSection,
    nodes: [
      {
        nodeId: "hidden-group",
        structure: "group",
        isPruned: true,
        children: [
          { nodeId: "hidden-child", role: "text", text: "Me gustaría conocerte", isPruned: false },
          { nodeId: "hidden-image", role: "image", isPruned: false },
        ],
      },
      {
        nodeId: "visible-group",
        structure: "group",
        isPruned: false,
        children: [
          { nodeId: "pruned-leaf", role: "text", text: "Own prune", isPruned: true },
        ],
      },
    ],
  }

  it("shows leaves under a hidden group as hidden and disables their own toggle", () => {
    render(<Harness onStructuralChange={vi.fn()} initial={hiddenGroupSection} />)

    const inherited = screen.getAllByTitle("Hidden because its group is hidden")
    expect(inherited).toHaveLength(2)
    for (const button of inherited) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it("keeps the group's own toggle and an own-pruned leaf's toggle enabled", () => {
    render(<Harness onStructuralChange={vi.fn()} initial={hiddenGroupSection} />)

    const include = screen.getAllByTitle("Include in render") as HTMLButtonElement[]
    // hidden-group itself + pruned-leaf
    expect(include).toHaveLength(2)
    for (const button of include) expect(button.disabled).toBe(false)
  })
})

describe("SectionTreeEditor highlightNodeId (#596)", () => {
  function HighlightHarness({ highlightNodeId }: { highlightNodeId: string | null }) {
    const [section, setSection] = useState(initialSection)
    return (
      <SectionTreeEditor
        section={section}
        onChange={setSection}
        bookLabel="test-book"
        highlightNodeId={highlightNodeId}
      />
    )
  }

  it("marks the highlighted row and scrolls it into view", () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<HighlightHarness highlightNodeId="sense-text" />)

    const row = document.querySelector('[data-node-id="sense-text"]')
    expect(row?.getAttribute("data-highlighted")).toBe("true")
    expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(1)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it("expands a collapsed group so the highlighted row is reachable", () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { rerender } = render(<HighlightHarness highlightNodeId={null} />)
    const senseGroup = document.querySelector('[data-node-id="sense-group"]')!
    fireEvent.click(senseGroup.querySelector('button[title="Collapse"]')!)
    expect(screen.queryByText("Sense")).toBeNull()

    rerender(<HighlightHarness highlightNodeId="sense-text" />)
    expect(screen.getByText("Sense")).toBeTruthy()
  })
})
