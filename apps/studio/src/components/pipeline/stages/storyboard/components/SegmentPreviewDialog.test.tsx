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

  it("keeps finding a free spot once the cascade reaches the image edge", () => {
    const added: Region[] = []
    for (let i = 0; i < 40; i++) added.push({ label: `box ${i + 1}`, ...newRegionBox(added, W, H) })

    // The seventh add is the last one that fits before the bottom edge; the
    // eighth wraps round to the top instead of landing on it.
    expect(added[6]).toMatchObject({ cropLeft: 290, cropTop: 190, cropBottom: 290 })
    expect(added[7]).toMatchObject({ cropLeft: 305, cropTop: 4, cropBottom: 104 })

    expect(new Set(added.map((r) => `${r.cropLeft},${r.cropTop}`)).size).toBe(added.length)
    for (const r of added) {
      expect(r.cropLeft).toBeGreaterThanOrEqual(0)
      expect(r.cropTop).toBeGreaterThanOrEqual(0)
      expect(r.cropRight).toBeLessThanOrEqual(W)
      expect(r.cropBottom).toBeLessThanOrEqual(H)
    }
  })
})

describe("SegmentPreviewDialog", () => {
  it("moves focus into the dialog, traps Tab, and returns focus on close", () => {
    const opener = document.createElement("button")
    document.body.append(opener)
    opener.focus()
    renderDialog()

    const add = button("Add region")
    const lastBox = button("drawing")
    expect(screen.getByRole("dialog", { name: /Segment Preview/ }).getAttribute("aria-modal")).toBe("true")
    expect(document.activeElement).toBe(add)

    fireEvent.keyDown(add, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(lastBox)
    fireEvent.keyDown(lastBox, { key: "Tab" })
    expect(document.activeElement).toBe(add)

    cleanup()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it("focuses the next box after removal, or Add region when none remain", () => {
    renderDialog()
    const first = button("photo")
    first.focus()
    fireEvent.keyDown(first, { key: "Enter" })
    fireEvent.keyDown(first, { key: "Delete" })
    expect(document.activeElement).toBe(button("drawing"))

    const last = button("drawing")
    fireEvent.keyDown(last, { key: "Enter" })
    fireEvent.keyDown(last, { key: "Backspace" })
    expect(document.activeElement).toBe(button("Add region"))
  })

  it("focuses a newly added box so arrow keys can place it immediately", () => {
    const onApply = renderDialog([])
    fireEvent.click(button("Add region"))

    const box = button("Region 1")
    expect(document.activeElement).toBe(box)
    expect(box.getAttribute("aria-pressed")).toBe("true")
    fireEvent.keyDown(box, { key: "ArrowRight" })

    expect(applied(onApply)).toEqual([{
      label: "Region 1", cropLeft: 201, cropTop: 100, cropRight: 401, cropBottom: 200,
    }])
  })

  it("keeps arrow presses on dialog controls from navigating the page behind it", () => {
    const pageKeyDown = vi.fn()
    window.addEventListener("keydown", pageKeyDown)
    try {
      renderDialog()
      fireEvent.keyDown(button("Add region"), { key: "ArrowRight" })
      fireEvent.keyDown(button("photo"), { key: "ArrowLeft" })
      expect(pageKeyDown).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener("keydown", pageKeyDown)
    }
  })

  it.each([
    ["ArrowLeft", 99, 50],
    ["ArrowRight", 101, 50],
    ["ArrowUp", 100, 49],
    ["ArrowDown", 100, 51],
  ])("moves a selected box with %s", (key, left, top) => {
    const onApply = renderDialog([{ label: "photo", cropLeft: 100, cropTop: 50, cropRight: 200, cropBottom: 150 }])
    const box = button("photo")
    box.focus()
    fireEvent.keyDown(box, { key: "Enter" })
    fireEvent.keyDown(box, { key })

    expect(applied(onApply)).toEqual([{
      label: "photo", cropLeft: left, cropTop: top, cropRight: left + 100, cropBottom: top + 100,
    }])
  })

  it.each([
    ["ArrowLeft", 199, 150],
    ["ArrowRight", 201, 150],
    ["ArrowUp", 200, 149],
    ["ArrowDown", 200, 151],
  ])("resizes a selected box with Shift+%s", (key, right, bottom) => {
    const onApply = renderDialog([{ label: "photo", cropLeft: 100, cropTop: 50, cropRight: 200, cropBottom: 150 }])
    const box = button("photo")
    box.focus()
    fireEvent.keyDown(box, { key: "Enter" })
    fireEvent.keyDown(box, { key, shiftKey: true })

    expect(applied(onApply)).toEqual([{
      label: "photo", cropLeft: 100, cropTop: 50, cropRight: right, cropBottom: bottom,
    }])
  })

  it("keeps keyboard movement and resizing inside the image and above the minimum size", () => {
    const onApply = renderDialog([{ label: "photo", cropLeft: 590, cropTop: 290, cropRight: 600, cropBottom: 300 }])
    const box = button("photo")
    box.focus()
    fireEvent.keyDown(box, { key: "Enter" })
    for (const key of ["ArrowRight", "ArrowDown"]) {
      fireEvent.keyDown(box, { key })
      fireEvent.keyDown(box, { key, shiftKey: true })
    }
    for (const key of ["ArrowLeft", "ArrowUp"]) fireEvent.keyDown(box, { key, shiftKey: true })

    expect(applied(onApply)).toEqual([{
      label: "photo", cropLeft: 590, cropTop: 290, cropRight: 600, cropBottom: 300,
    }])
  })

  it("does not let keyboard input change a box while Apply is pending", () => {
    const onApply = vi.fn(() => new Promise<void>(() => {}))
    render(
      <SegmentPreviewDialog
        imageSrc="img.png"
        imageWidth={W}
        imageHeight={H}
        regions={[{ label: "photo", cropLeft: 100, cropTop: 50, cropRight: 200, cropBottom: 150 }]}
        onApply={onApply}
        onClose={() => {}}
      />,
    )
    const box = button("photo")
    box.focus()
    fireEvent.keyDown(box, { key: "Enter" })
    fireEvent.click(button("Apply Segmentation"))
    expect(button("Add region").disabled).toBe(true)

    fireEvent.keyDown(box, { key: "ArrowRight" })
    fireEvent.keyDown(box, { key: "ArrowDown", shiftKey: true })
    fireEvent.keyDown(box, { key: " " })
    expect(box.style.left).toBe("100px")
    expect(box.style.height).toBe("100px")
    expect(box.getAttribute("aria-pressed")).toBe("true")
  })

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

  it.each(["Delete", "Backspace"])("removes the selected region with the %s key", (key) => {
    const onApply = renderDialog()

    selectBox("photo")
    fireEvent.keyDown(window, { key })

    expect(applied(onApply)).toEqual([detected[1]])
  })

  it.each([
    ["Enter", "Enter"],
    ["Space", " "],
  ])("selects a region from the keyboard with %s, so it can be removed without a mouse", (_name, key) => {
    const onApply = renderDialog()
    // Each box is a focusable toggle button named after its region.
    const box = button("photo")
    expect(box.tabIndex).toBe(0)
    expect(box.getAttribute("aria-pressed")).toBe("false")

    box.focus()
    fireEvent.keyDown(box, { key })
    expect(box.getAttribute("aria-pressed")).toBe("true")
    expect(button("drawing").getAttribute("aria-pressed")).toBe("false")
    expect(button("Remove region").disabled).toBe(false)

    // The same key lets go of it again.
    fireEvent.keyDown(box, { key })
    expect(box.getAttribute("aria-pressed")).toBe("false")
    expect(button("Remove region").disabled).toBe(true)

    fireEvent.keyDown(box, { key })
    fireEvent.keyDown(box, { key: "Delete" })

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
