import { beforeEach, describe, expect, it, vi } from "vitest";

const protocolMock = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("electron/main", () => ({ protocol: protocolMock }));

import {
  HTML_RENDER_SCHEME_PRIVILEGES,
  htmlStore,
  registerHtmlRenderProtocol,
} from "./html-render";

describe("html-render protocol", () => {
  beforeEach(() => {
    protocolMock.handle.mockReset();
    htmlStore.clear();
  });

  it("registers without secure scheme privileges", () => {
    expect(HTML_RENDER_SCHEME_PRIVILEGES.privileges).toEqual({
      standard: true,
    });
  });

  it("serves stored HTML with a sandbox CSP", async () => {
    htmlStore.set("screenshot-id", "<script>untrusted()</script>");
    registerHtmlRenderProtocol();

    const handler = protocolMock.handle.mock.calls[0]?.[1] as (
      request: { url: string },
    ) => Promise<Response>;
    const response = await handler({
      url: "html-render://screenshot-id",
    });
    const policy = response.headers.get("Content-Security-Policy");

    expect(await response.text()).toBe("<script>untrusted()</script>");
    expect(policy).toBe("sandbox allow-scripts");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
