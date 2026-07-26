// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { isAnyModalOpen } from "./modal-state"

function appendOpenPopup(
  role: "dialog" | "menu",
  attrs: Record<string, string> = {},
): HTMLElement {
  const popup = document.createElement("div")
  popup.setAttribute("role", role)
  popup.setAttribute("data-open", "")
  for (const [key, value] of Object.entries(attrs)) {
    popup.setAttribute(key, value)
  }
  document.body.appendChild(popup)
  return popup
}

describe("isAnyModalOpen", () => {
  beforeEach(() => document.body.replaceChildren())

  it("ignores the outer dock panel popup", () => {
    appendOpenPopup("dialog", { "data-dock-panel": "" })

    expect(isAnyModalOpen()).toBe(false)
  })

  it.each(["dialog", "menu"] as const)(
    "detects a nested Base UI %s popup while the dock panel is open",
    (role) => {
      appendOpenPopup("dialog", { "data-dock-panel": "" })
      appendOpenPopup(role)

      expect(isAnyModalOpen()).toBe(true)
    },
  )

  it("continues to detect Radix dialogs and poppers", () => {
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    dialog.setAttribute("data-state", "open")
    document.body.appendChild(dialog)
    expect(isAnyModalOpen()).toBe(true)

    dialog.remove()
    const popper = document.createElement("div")
    popper.setAttribute("data-radix-popper-content-wrapper", "")
    document.body.appendChild(popper)
    expect(isAnyModalOpen()).toBe(true)
  })
})
