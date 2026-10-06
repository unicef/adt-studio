import { protocol } from "electron/main";

const htmlStore = new Map<string, string>();
const HTML_RENDER_SCHEME_PRIVILEGES = {
  scheme: "html-render",
  privileges: { standard: true },
} as Electron.CustomScheme;

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "img-src data:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  // This hash permits only the fixed FITB hydration script from screenshot-html.ts.
  "script-src 'sha256-+miJbuqVasNIjP3K3SJ/uFZdSixGSCT81PIrua6INnE='",
  "sandbox allow-scripts",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

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
