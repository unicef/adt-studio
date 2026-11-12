import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { protocol } from "electron";

export const STUDIO_APP_HOST = "adt.studio";
export const STUDIO_APP_ORIGIN = `app://${STUDIO_APP_HOST}`;
export const STUDIO_APP_SCHEME_PRIVILEGES = {
  scheme: "app",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
} as Electron.CustomScheme;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function isPathInsideRoot(filePath: string, rootDir: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedRoot = path.resolve(rootDir);
  if (process.platform === "win32") {
    const f = resolvedFile.toLowerCase();
    const r = resolvedRoot.toLowerCase();
    return f === r || f.startsWith(r + path.sep);
  }
  return (
    resolvedFile === resolvedRoot ||
    resolvedFile.startsWith(resolvedRoot + path.sep)
  );
}

async function serveFile(filePath: string): Promise<Response> {
  const data = await readFile(filePath);
  return new Response(data, {
    status: 200,
    headers: { "Content-Type": contentTypeFor(filePath) },
  });
}

export function registerStudioAppProtocol(rendererDistDir: string): void {
  const root = rendererDistDir;

  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== STUDIO_APP_HOST) {
      return new Response("Not Found", { status: 404 });
    }

    let pathname = decodeURI(url.pathname);
    if (!pathname || pathname === "/") {
      pathname = "/index.html";
    }

    const relative = pathname.replace(/^\/+/, "");
    const candidate = path.join(root, relative);

    if (!isPathInsideRoot(candidate, root)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const st = await stat(candidate);

      if (st.isFile()) {
        return await serveFile(candidate);
      }

      if (st.isDirectory()) {
        const indexInDir = path.join(candidate, "index.html");
        if (isPathInsideRoot(indexInDir, root)) {
          return await serveFile(indexInDir);
        }
      }
    } catch {}

    const indexHtml = path.join(root, "index.html");

    if (!isPathInsideRoot(indexHtml, root)) {
      return new Response("Forbidden", { status: 403 });
    }

    return await serveFile(indexHtml);
  });
}
