import { describe, it, expect } from "vitest"
import { resolveBaseUrl } from "./client.js"

describe("resolveBaseUrl", () => {
  it("returns full API URL when protocol is tauri:", () => {
    expect(resolveBaseUrl({ protocol: "tauri:", hostname: "tauri.localhost" })).toBe(
      "http://localhost:3001/api",
    )
  })

  it("returns full API URL when hostname is tauri.localhost (Windows WebView2)", () => {
    // On Windows, Tauri uses https://tauri.localhost as the webview origin.
    // The protocol check alone isn't sufficient — the hostname check catches this.
    expect(resolveBaseUrl({ protocol: "https:", hostname: "tauri.localhost" })).toBe(
      "http://localhost:3001/api",
    )
  })

  it("returns relative /api in browser dev mode", () => {
    expect(resolveBaseUrl({ protocol: "http:", hostname: "localhost" })).toBe("/api")
  })

  it("returns relative /api for standard browser origins", () => {
    expect(resolveBaseUrl({ protocol: "https:", hostname: "example.com" })).toBe("/api")
  })
})
