import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl } from "./external-url";

describe("isAllowedExternalUrl", () => {
  it.each([
    "https://example.com/path",
    "http://example.com/path",
    "http://127.0.0.1:3001/api/books/example-book/source-pdf",
  ])("allows web URLs, including the desktop source-PDF URL: %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });

  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "mailto:user@example.com",
    "custom-scheme://example.com",
    "not a URL",
  ])("rejects non-web or invalid URLs: %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });
});
