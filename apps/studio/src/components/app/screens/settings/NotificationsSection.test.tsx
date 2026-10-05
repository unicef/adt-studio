// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
}))

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    id: strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    i18n: { locale: "en", _: (d: { id?: string }) => d.id ?? "" },
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))
vi.mock("@/components/ui/sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}))

import { NotificationsSection } from "./NotificationsSection"
import { setNotificationPrefs } from "@/hooks/use-notification-prefs"

const showNotification = vi.fn(() => Promise.resolve())

const tile = (anchor: string) => document.getElementById(`settings-notification-${anchor}`)

const radio = (anchor: string, name: string) =>
  [...tile(anchor)!.querySelectorAll("button")].find((b) => b.textContent === name)!

const testButton = (name: string) =>
  [...tile("test")!.querySelectorAll("button")].find((b) => b.textContent?.includes(name))

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  showNotification.mockClear()
  localStorage.clear()
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 adt-studio/1.0 Electron/30.0.0",
  })
  ;(window as unknown as { api: unknown }).api = {
    notifications: { show: showNotification, isWindowFocused: vi.fn(), onActivated: vi.fn() },
  }
  setNotificationPrefs({ osNotifications: true })
})

afterEach(() => {
  cleanup()
  delete (window as unknown as { api?: unknown }).api
})

describe("NotificationsSection", () => {
  it("shows the desktop-alerts tile on Electron and defaults it to on", () => {
    render(<NotificationsSection />)

    expect(radio("os-alerts", "On").getAttribute("aria-checked")).toBe("true")
  })

  it("hides the desktop-alerts tile off Electron", () => {
    delete (window as unknown as { api?: unknown }).api
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 Chrome" })

    render(<NotificationsSection />)

    expect(tile("os-alerts")).toBeNull()
  })

  it("tests the two channels independently", () => {
    render(<NotificationsSection />)

    fireEvent.click(testButton("In-app toast")!)
    expect(mocks.toastSuccess).toHaveBeenCalledOnce()
    expect(showNotification).not.toHaveBeenCalled()

    fireEvent.click(testButton("Desktop alert")!)
    expect(mocks.toastSuccess).toHaveBeenCalledOnce()
    expect(showNotification).toHaveBeenCalledOnce()
  })

  it("still tests desktop alerts while the switch is off", () => {
    setNotificationPrefs({ osNotifications: false })
    render(<NotificationsSection />)

    fireEvent.click(testButton("Desktop alert")!)

    expect(showNotification).toHaveBeenCalledOnce()
  })

  it("offers no desktop-alert test off Electron", () => {
    delete (window as unknown as { api?: unknown }).api
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 Chrome" })

    render(<NotificationsSection />)

    expect(testButton("Desktop alert")).toBeUndefined()
    expect(testButton("In-app toast")).toBeDefined()
  })

  it("persists the desktop-alerts choice", () => {
    render(<NotificationsSection />)

    fireEvent.click(radio("os-alerts", "Off"))

    expect(JSON.parse(localStorage.getItem("adt.notifications")!).osNotifications).toBe(false)
  })
})
