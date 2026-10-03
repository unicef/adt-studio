import { describe, expect, it, vi } from "vitest";
import { isAllowedExternalUrl } from "./onboarding";

vi.mock("electron", () => ({
  BrowserWindow: class {},
  protocol: {},
  shell: {},
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
}));

describe("isAllowedExternalUrl", () => {
  it("allows HTTPS URLs", () => {
    expect(isAllowedExternalUrl("https://example.com/path")).toBe(true);
  });

  it.each([
    "http://example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "mailto:user@example.com",
    "not a URL",
  ])("rejects non-HTTPS or invalid URLs: %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });
});
