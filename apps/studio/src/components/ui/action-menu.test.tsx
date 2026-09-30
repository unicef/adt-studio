// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ActionMenu } from "./action-menu"

afterEach(cleanup)

describe("ActionMenu", () => {
  it("portals accessible menu actions outside an overflow-clipped ancestor", () => {
    const onSelect = vi.fn()
    render(
      <div data-testid="clipped-container" className="overflow-hidden">
        <ActionMenu
          trigger="Actions"
          triggerClassName="button"
          items={[{ label: "Delete", onClick: onSelect }]}
        />
      </div>
    )

    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), {
      button: 0,
      ctrlKey: false,
    })

    const menu = screen.getByRole("menu")
    expect(within(screen.getByTestId("clipped-container")).queryByRole("menu")).toBeNull()
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toBeTruthy()

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("closes on Escape", () => {
    render(
      <ActionMenu
        trigger="Actions"
        triggerClassName="button"
        items={[{ label: "Delete", onClick: vi.fn() }]}
      />
    )

    const trigger = screen.getByRole("button", { name: "Actions" })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })

    expect(screen.queryByRole("menu")).toBeNull()
  })
})
