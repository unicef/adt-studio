// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { initializeOrderingActivity } from "./activity-ordering"
import {
  confettiTriggerAtom,
  submitEnabledAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "../state/activity.atoms"
import { currentSectionIdAtom, pagesAtom } from "../../navigation/state/nav.atoms"

const dragMocks = vi.hoisted(() => ({
  dropTargets: [] as Array<{
    element: HTMLElement
    onDrop: (args: { source: { data: Record<string, unknown> } }) => void
  }>,
}))

vi.mock("@atlaskit/pragmatic-drag-and-drop/element/adapter", () => ({
  draggable: () => () => {},
  dropTargetForElements: (config: (typeof dragMocks.dropTargets)[number]) => {
    dragMocks.dropTargets.push(config)
    return () => {}
  },
}))

const store = getDefaultStore()

function setup(): void {
  document.body.innerHTML = `
    <section data-section-type="activity_ordering"
             data-section-id="pg045_sec001"
             data-correct-order="item-2,item-1,item-4,item-3">
      <ol data-activity-order-list>
        <li data-activity-item="item-1"><span>Shira — 3626 m</span></li>
        <li data-activity-item="item-2"><span>Oldeani — 3188 m</span></li>
        <li data-activity-item="item-3"><span>Meru — 4566 m</span></li>
        <li data-activity-item="item-4"><span>Klute — 3952 m</span></li>
      </ol>
    </section>`
  window.correctAnswers = undefined
}

function item(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-activity-item="${id}"]`)!
}

function order(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-activity-order-list] > [data-activity-item]"))
    .map((element) => element.getAttribute("data-activity-item")!)
}

beforeEach(() => {
  dragMocks.dropTargets.length = 0
  document.body.innerHTML = ""
  store.set(submitEnabledAtom, false)
  store.set(submitStateAtom, "submit")
  store.set(validateHandlerAtom, () => null)
  store.set(confettiTriggerAtom, 0)
  store.set(pagesAtom, [{ section_id: "pg045_sec001", href: "pg045_sec001.html" }])
  store.set(currentSectionIdAtom, "pg045_sec001")
})

describe("initializeOrderingActivity", () => {
  it("does nothing without an ordering section", () => {
    document.body.innerHTML = '<section data-section-type="text_only"></section>'
    expect(initializeOrderingActivity()).toBeNull()
  })

  it("adds visible move controls and positional accessibility metadata", () => {
    setup()
    initializeOrderingActivity()

    expect(item("item-1").querySelectorAll("[data-order-move]")).toHaveLength(2)
    expect(item("item-1").getAttribute("aria-posinset")).toBe("1")
    expect(item("item-4").getAttribute("aria-setsize")).toBe("4")
    expect(item("item-1").querySelector<HTMLButtonElement>('[data-order-move="up"]')?.disabled).toBe(true)
    expect(item("item-4").querySelector<HTMLButtonElement>('[data-order-move="down"]')?.disabled).toBe(true)
  })

  it("moves a focused item with Arrow Up and Arrow Down", () => {
    setup()
    initializeOrderingActivity()

    item("item-2").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }))
    expect(order()).toEqual(["item-2", "item-1", "item-3", "item-4"])

    item("item-1").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    expect(order()).toEqual(["item-2", "item-3", "item-1", "item-4"])
  })

  it("moves an item through the pointer drop handler and announces its position", async () => {
    setup()
    initializeOrderingActivity()

    const target = dragMocks.dropTargets.find((entry) => entry.element === item("item-4"))
    target?.onDrop({ source: { data: { itemId: "item-1" } } })

    expect(order()).toEqual(["item-2", "item-3", "item-4", "item-1"])
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(document.getElementById("sr-announcement")?.textContent).toContain("Position 4 of 4")
  })

  it("restores the initial sequence with the reset control", () => {
    setup()
    initializeOrderingActivity()
    item("item-2").querySelector<HTMLButtonElement>('[data-order-move="up"]')?.click()

    document.querySelector<HTMLButtonElement>("[data-order-reset]")?.click()

    expect(order()).toEqual(["item-1", "item-2", "item-3", "item-4"])
  })

  it("moves items with the visible buttons and validates the correct order", () => {
    setup()
    initializeOrderingActivity()

    item("item-2").querySelector<HTMLButtonElement>('[data-order-move="up"]')?.click()
    item("item-4").querySelector<HTMLButtonElement>('[data-order-move="up"]')?.click()
    expect(order()).toEqual(["item-2", "item-1", "item-4", "item-3"])

    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(confettiTriggerAtom)).toBe(1)
    expect(document.querySelectorAll('[data-order-verdict]')).toHaveLength(4)
  })

  it("marks an incorrect order and stays in submit state", () => {
    setup()
    initializeOrderingActivity()
    store.get(validateHandlerAtom)?.()

    expect(store.get(submitStateAtom)).toBe("submit")
    expect(item("item-1").getAttribute("aria-invalid")).toBe("true")
    expect(store.get(confettiTriggerAtom)).toBe(0)
  })

  it("can derive the correct order from ranked activity answers", () => {
    setup()
    document.querySelector("section")?.removeAttribute("data-correct-order")
    window.correctAnswers = {
      "item-1": "2",
      "item-2": "1",
      "item-3": "4",
      "item-4": "3",
    }
    expect(initializeOrderingActivity()).not.toBeNull()
  })
})
