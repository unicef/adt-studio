// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { saveTextFile } from "./save-text-file"

const electronAgent = "Mozilla/5.0 Electron/33.0.0"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, "api")
})

describe("saveTextFile", () => {
  it("downloads the text under the given name in the browser", async () => {
    const created: Blob[] = []
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => { created.push(blob); return "blob:request" }),
      revokeObjectURL: vi.fn(),
    }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

    expect(await saveTextFile("workbook-repair-request.md", "Repair this ADT.")).toBe(true)

    expect(click).toHaveBeenCalledTimes(1)
    const anchor = click.mock.contexts[0] as HTMLAnchorElement
    expect(anchor.download).toBe("workbook-repair-request.md")
    expect(anchor.href).toBe("blob:request")
    // jsdom's Blob has no text(); FileReader reads it the same way.
    const read = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsText(created[0]!)
    })
    expect(read).toBe("Repair this ADT.")
    expect(created[0]!.type).toBe("text/markdown;charset=utf-8")
  })

  it("uses the desktop save dialog when there is one", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(electronAgent)
    const saveFile = vi.fn().mockResolvedValue("/home/me/workbook-repair-request.md")
    Object.defineProperty(window, "api", { configurable: true, value: { saveFile } })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

    expect(await saveTextFile("workbook-repair-request.md", "Reparar ñ")).toBe(true)

    expect(click).not.toHaveBeenCalled()
    expect(saveFile).toHaveBeenCalledWith(
      { defaultPath: "workbook-repair-request.md", filters: [{ name: "Markdown", extensions: ["md"] }] },
      new TextEncoder().encode("Reparar ñ"),
    )
  })

  it("reports a cancelled desktop save dialog", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(electronAgent)
    Object.defineProperty(window, "api", { configurable: true, value: { saveFile: vi.fn().mockResolvedValue(null) } })

    expect(await saveTextFile("workbook-repair-request.md", "Repair this ADT.")).toBe(false)
  })
})
