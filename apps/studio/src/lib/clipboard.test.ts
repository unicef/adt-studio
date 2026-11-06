// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { writeClipboardText } from "./clipboard"

const original = Object.getOwnPropertyDescriptor(navigator, "clipboard")

afterEach(() => {
  if (original) Object.defineProperty(navigator, "clipboard", original)
  else Reflect.deleteProperty(navigator, "clipboard")
  vi.restoreAllMocks()
})

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value })
}

describe("writeClipboardText", () => {
  it("uses the clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    await writeClipboardText("hello")
    expect(writeText).toHaveBeenCalledWith("hello")
  })

  it("falls back to execCommand on an insecure origin, where the API is missing", async () => {
    setClipboard(undefined)
    let copied = ""
    document.execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement).value
      return true
    })
    await writeClipboardText("from http")
    expect(copied).toBe("from http")
    expect(document.querySelector("textarea")).toBeNull()
  })

  it("rejects when neither path copies", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) })
    document.execCommand = vi.fn(() => false)
    await expect(writeClipboardText("x")).rejects.toThrow("Copy failed")
  })
})
