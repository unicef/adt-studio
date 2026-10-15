import { protocol } from "electron/main";

const htmlStore = new Map<string, string>();
const HTML_RENDER_SCHEME_PRIVILEGES = {
  scheme: "html-render",
  privileges: { standard: true },
} as Electron.CustomScheme;

// Screenshot HTML carries its resource policy in a CSP meta tag so Playwright
// and Electron use the same dynamically calculated FITB script hash. Keep the
// sandbox in the response header: CSP meta tags cannot provide this boundary.
const CONTENT_SECURITY_POLICY = "sandbox allow-scripts";

function registerHtmlRenderProtocol(): void {
  protocol.handle("html-render", async (request) => {
    const id = new URL(request.url).hostname;
    const html = htmlStore.get(id) ?? `<h1>Not found</h1>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

export { registerHtmlRenderProtocol, HTML_RENDER_SCHEME_PRIVILEGES, htmlStore };
