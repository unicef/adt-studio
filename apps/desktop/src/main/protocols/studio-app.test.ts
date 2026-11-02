import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ net: {}, protocol: {} }));

import { resolvePreviewProxyUrl } from "./studio-app";

const at = (path: string) => new URL(`app://adt.studio${path}`);

describe("resolvePreviewProxyUrl", () => {
  it("proxies packaged ADT preview requests to the API port", () => {
    expect(
      resolvePreviewProxyUrl(at("/api/books/raven/adt/v-abc/pg002_sec001.html?lang=en"), 5421),
    ).toBe("http://127.0.0.1:5421/api/books/raven/adt/v-abc/pg002_sec001.html?lang=en");
  });

  it("leaves every other API route to the renderer's own requests", () => {
    expect(resolvePreviewProxyUrl(at("/api/books/raven/pages"), 5421)).toBeNull();
    expect(resolvePreviewProxyUrl(at("/api/providers"), 5421)).toBeNull();
  });

  it("does not let dot segments escape the bundle path", () => {
    expect(resolvePreviewProxyUrl(at("/api/books/raven/adt/../../../providers"), 5421)).toBeNull();
    expect(resolvePreviewProxyUrl(at("/api/books/raven/adt/%2e%2e/%2e%2e/config"), 5421)).toBeNull();
  });

  it("serves the Studio app shell when the API is not up yet", () => {
    expect(resolvePreviewProxyUrl(at("/api/books/raven/adt/index.html"), null)).toBeNull();
  });

  it("ignores non-API paths", () => {
    expect(resolvePreviewProxyUrl(at("/books/raven/preview"), 5421)).toBeNull();
  });
});
