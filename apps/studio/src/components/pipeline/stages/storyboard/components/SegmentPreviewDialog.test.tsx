// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const translate = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: translate }),
}))
vi.mock("@/components/title-bar", () => ({ MacOSTrafficLightSpacer: () => null }))

const { SegmentPreviewDialog, newRegionBox } = await import("./SegmentPreviewDialog")
type Region = import("./SegmentPreviewDialog").SegmentRegion

const W = 600
const H = 300
const detected: Region[] = [
  { label: "photo", cropLeft: 0, cropTop: 0, cropRight: 300, cropBottom: 300 },
  { label: "drawing", cropLeft: 300, cropTop: 0, cropRight: 600, cropBottom: 300 },
]

function renderDialog(regions: Region[] = detected) {
  const onApply = vi.fn<(regions: Region[]) => Promise<void>>().mockResolvedValue()
  render(
    <SegmentPreviewDialog
      imageSrc="img.png"
      imageWidth={W}
      imageHeight={H}
      regions={regions}
      onApply={onApply}
      onClose={() => {}}
    />,
  )
  return onApply
}

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement
const applied = (onApply: ReturnType<typeof renderDialog>) => {
  fireEvent.click(button("Apply Segmentation"))
  return onApply.mock.calls[0][0]
}
// The label sits inside its box; pressing on the box selects it.
const selectBox = (label: string) => {
  fireEvent.mouseDown(screen.getByText(label).parentElement!)
  fireEvent.mouseUp(window)
}

beforeEach(() => {
  // jsdom has no layout; give the image area room so the boxes render at 1:1.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(W + 48)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(H + 48)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("newRegionBox", () => {
  it("centres a third-of-the-image box", () => {
    expect(newRegionBox([], W, H)).toEqual({ cropLeft: 200, cropTop: 100, cropRight: 400, cropBottom: 200 })
  })

  it("steps past a box already at that spot and stays inside the image", () => {
    const first = { label: "a", ...newRegionBox([], W, H) }
    expect(newRegionBox([first], W, H)).toEqual({ cropLeft: 215, cropTop: 115, cropRight: 415, cropBottom: 215 })

    const full = { label: "full", cropLeft: 0, cropTop: 0, cropRight: 10, cropBottom: 10 }
    expect(newRegionBox([full], 10, 10)).toEqual({ cropLeft: 0, cropTop: 0, cropRight: 10, cropBottom: 10 })
  })
})

describe("SegmentPreviewDialog", () => {
  it("adds a region for something the model missed", () => {
    const onApply = renderDialog()

    fireEvent.click(button("Add region"))
    fireEvent.click(button("Add region"))

    expect(screen.getByText("Region 3")).toBeTruthy()
    expect(screen.getByText("Region 4")).toBeTruthy()
    expect(applied(onApply)).toEqual([
      ...detected,
      { label: "Region 3", cropLeft: 200, cropTop: 100, cropRight: 400, cropBottom: 200 },
      { label: "Region 4", cropLeft: 215, cropTop: 115, cropRight: 415, cropBottom: 215 },
    ])
  })

  it("skips a label that is already taken", () => {
    const onApply = renderDialog([{ label: "Region 2", cropLeft: 0, cropTop: 0, cropRight: 600, cropBottom: 300 }])

    fireEvent.click(button("Add region"))

    expect(applied(onApply).map((r) => r.label)).toEqual(["Region 2", "Region 3"])
  })

  it("removes the selected region with the button or the Delete key", () => {
    const onApply = renderDialog()
    expect(button("Remove region").disabled).toBe(true)

    // A freshly added box is selected, so a mistaken add is one click to undo.
    fireEvent.click(button("Add region"))
    fireEvent.click(button("Remove region"))
    expect(screen.queryByText("Region 3")).toBeNull()
    expect(button("Remove region").disabled).toBe(true)

    selectBox("photo")
    fireEvent.keyDown(window, { key: "Delete" })

    expect(applied(onApply)).toEqual([detected[1]])
  })

  it("leaves the boxes alone while one is being dragged", () => {
    renderDialog()

    fireEvent.mouseDown(screen.getByText("photo").parentElement!)
    fireEvent.keyDown(window, { key: "Backspace" })

    expect(screen.getByText("photo")).toBeTruthy()
  })

  it("cannot apply once every region is removed", () => {
    renderDialog([detected[0]])

    selectBox("photo")
    fireEvent.click(button("Remove region"))

    expect(button("Apply Segmentation").disabled).toBe(true)
  })
})
