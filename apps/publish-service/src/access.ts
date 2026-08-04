import type { Context, Hono } from "hono"
import { getCookie, setCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import {
  PUBLICATION_ACCESS_COOKIE,
  PUBLICATION_ACCESS_MAX_AGE_SECONDS,
  type Publication,
} from "@adt/types"
import type { Env } from "./env.js"
import { errorResponse } from "./errors.js"
import { accessCookieIsValid, accessCookieValue, verifyAccessCode } from "./identity.js"
import type { PublicationVariables } from "./middleware/publication-lookup.js"
import { normalizeSnapshotPath } from "./snapshot.js"

export type AccessAppEnv = { Bindings: Env; Variables: PublicationVariables }

type AccessContext = Context<AccessAppEnv>

const UNAUTHORIZED_MESSAGE = "This book needs an access code — POST it to /p/:token/access"

const MISSING_SECRET_MESSAGE =
  "This worker has no MGMT_SECRET bound, so it cannot check access codes"

const CODE_FIELD = "code"

const NEXT_FIELD = "next"

/** A browser navigating to a page gets the code prompt; anything else — an image the page
 *  pulled in, `fetch` for the comments API, a script — gets the JSON envelope, because an
 *  HTML page substituted for a stylesheet is worse than an honest 401. */
function wantsHtml(c: AccessContext): boolean {
  if (c.req.header("sec-fetch-mode") === "navigate") return true
  if (c.req.header("sec-fetch-dest") === "document") return true
  const accept = c.req.header("accept") ?? ""
  return accept.includes("text/html")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** The place to send the reader once the code is accepted, rebuilt from scratch rather than
 *  echoed: the value goes through the same zip-slip normaliser as a snapshot path and is
 *  re-prefixed with this publication's own root, so it can never become an open redirect. */
function safeNext(token: string, raw: string | undefined): string {
  const root = `/p/${token}/`
  if (raw === undefined || raw.length === 0) return root
  const relative = normalizeSnapshotPath(raw)
  if (relative === null || relative.length === 0) return root
  return `${root}${relative}`
}

/** What `safeNext` will accept back: the request path with the `/p/<token>/` prefix removed. */
function currentRelative(c: AccessContext, token: string): string {
  const { pathname } = new URL(c.req.url)
  const prefix = `/p/${token}`
  if (!pathname.startsWith(prefix)) return ""
  const rest = pathname.slice(prefix.length).replace(/^\/+/, "")
  return normalizeSnapshotPath(rest) === null ? "" : rest
}

export interface GatePageOptions {
  wrongCode?: boolean
  /** Path inside the publication the reader was heading for, so the code prompt does not
   *  swallow the deep link they followed. */
  next?: string | undefined
}

/**
 * The access-code page: a whole document in one response, inline-styled and script-free, so it
 * renders identically whether the reader arrived before any of the snapshot's own assets
 * loaded or after the link was locked mid-visit. Deliberately English (the M1a.5 callback-page
 * precedent — worker-served pages sit outside the Lingui catalogs); see the contract's §4.15
 * note for the localisation follow-up.
 */
export function gatePage(publication: Publication, options: GatePageOptions = {}): string {
  const title = escapeHtml(publication.title)
  const wrong = options.wrongCode === true
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light }
  * { box-sizing: border-box }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:1.5rem;
         background:#f6f7f9; font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif; color:#18181b }
  main { width:100%; max-width:24rem; padding:2rem 2rem 1.75rem; background:#fff; border:1px solid #e4e4e7;
         border-radius:0.9rem; box-shadow:0 1px 2px rgba(0,0,0,.04); text-align:center;
         animation:rise .3s ease-out both }
  h1 { margin:0 0 .35rem; font-size:1.125rem; line-height:1.4 }
  p { margin:0; font-size:.9375rem; line-height:1.6; color:#52525b }
  form { margin:1.25rem 0 0; display:flex; flex-direction:column; gap:.4rem }
  label { font-size:.8125rem; font-weight:500; color:#52525b }
  input { width:100%; padding:.7rem .75rem; font:inherit; font-size:1.05rem; letter-spacing:.14em;
          text-align:center; text-transform:uppercase; border:1px solid #d4d4d8; border-radius:.6rem;
          background:#fff; color:inherit; transition:border-color .15s, box-shadow .15s }
  input:focus { outline:none; border-color:#4f46e5; box-shadow:0 0 0 3px rgba(79,70,229,.18) }
  input[aria-invalid="true"] { border-color:#dc2626; animation:nudge .28s ease-in-out both }
  button { margin-top:.35rem; padding:.7rem 1rem; font:inherit; font-weight:600; color:#fff; background:#4f46e5; border:0;
           border-radius:.6rem; cursor:pointer; transition:background-color .15s, transform .12s }
  button:hover { background:#4338ca }
  button:active { transform:translateY(1px) }
  .lock { width:2.5rem; height:2.5rem; margin:0 auto 1rem; border-radius:999px; background:#eef2ff;
          display:flex; align-items:center; justify-content:center; color:#4f46e5 }
  .error { margin:0; font-size:.875rem; line-height:1.5; color:#b91c1c }
  @keyframes rise { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
  @keyframes nudge { 25% { transform:translateX(-4px) } 75% { transform:translateX(4px) } }
  @media (prefers-reduced-motion: reduce) { main, input { animation:none } button { transition:none } }
</style></head>
<body>
<main>
  <div class="lock" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  </div>
  <h1>${title}</h1>
  <p>This book is shared with an access code. Enter the code you were given to open it.</p>
  <form method="post" action="/p/${escapeHtml(publication.token)}/access">
    <input type="hidden" name="${NEXT_FIELD}" value="${escapeHtml(options.next ?? "")}">
    <label for="code">Access code</label>
    <input id="code" name="${CODE_FIELD}" autofocus autocomplete="off" autocapitalize="characters"
           spellcheck="false" enterkeyhint="go" maxlength="12"${wrong ? ' aria-invalid="true"' : ""}>
    ${wrong ? `<p class="error" role="alert">That code doesn't open this book. Check it and try again.</p>` : ""}
    <button type="submit">Open the book</button>
  </form>
</main>
</body></html>
`
}

/**
 * Everything under `/p/:token/` is behind this once the publication has a code: pages, assets
 * and the comments API alike. It runs *after* the lookup ladder, so a revoked link still
 * answers `410` rather than asking for a code it would refuse anyway, and `MGMT_SECRET` walks
 * straight through — the author reads their own feedback through these routes.
 */
export const accessGate = createMiddleware<AccessAppEnv>(async (c, next) => {
  const packed = c.get("accessCodeHash")
  if (packed === null || c.get("isAuthor")) return next()

  const publication = c.get("publication")
  const secret = c.env?.MGMT_SECRET
  if (
    secret !== undefined &&
    (await accessCookieIsValid(
      getCookie(c, PUBLICATION_ACCESS_COOKIE),
      publication.token,
      packed,
      secret,
    ))
  ) {
    return next()
  }

  if (!wantsHtml(c)) {
    return errorResponse(c, "unauthorized", 401, UNAUTHORIZED_MESSAGE)
  }

  return c.html(gatePage(publication, { next: currentRelative(c, publication.token) }), 401)
})

async function readCode(c: AccessContext): Promise<{ code: string; next: string | undefined }> {
  const contentType = c.req.header("content-type") ?? ""
  if (contentType.includes("json")) {
    try {
      const body = (await c.req.json()) as Record<string, unknown>
      const code = body[CODE_FIELD]
      return { code: typeof code === "string" ? code.slice(0, 256) : "", next: undefined }
    } catch {
      return { code: "", next: undefined }
    }
  }

  try {
    const body = await c.req.parseBody()
    const code = body[CODE_FIELD]
    const target = body[NEXT_FIELD]
    return {
      code: typeof code === "string" ? code.slice(0, 256) : "",
      next: typeof target === "string" ? target : undefined,
    }
  } catch {
    return { code: "", next: undefined }
  }
}

export function registerAccessRoute(app: Hono<AccessAppEnv>): void {
  /** Registered before `accessGate` on purpose: the door cannot be behind the lock. */
  app.post("/p/:token/access", async (c) => {
    const publication = c.get("publication")
    const packed = c.get("accessCodeHash")
    const secret = c.env?.MGMT_SECRET
    const { code, next } = await readCode(c)
    const isForm = !(c.req.header("content-type") ?? "").includes("json")

    /** Runs even when there is nothing to verify against, so how long the answer takes never
     *  says whether this publication has a code or whether the code was close. */
    const verified = await verifyAccessCode(code, packed)

    if (packed === null) {
      return isForm
        ? c.redirect(safeNext(publication.token, next), 303)
        : c.body(null, 204)
    }

    if (secret === undefined) {
      return errorResponse(c, "internal_error", 500, MISSING_SECRET_MESSAGE)
    }

    if (!verified) {
      return isForm
        ? c.html(gatePage(publication, { wrongCode: true, next }), 401)
        : errorResponse(c, "unauthorized", 401, WRONG_CODE_MESSAGE)
    }

    setCookie(
      c,
      PUBLICATION_ACCESS_COOKIE,
      await accessCookieValue(publication.token, packed, secret),
      {
        path: `/p/${publication.token}`,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: PUBLICATION_ACCESS_MAX_AGE_SECONDS,
      },
    )

    /** `c.body`, never a bare `new Response`: the cookie lives in the context's prepared
     *  headers until the response is built through it. */
    return isForm
      ? c.redirect(safeNext(publication.token, next), 303)
      : c.body(null, 204)
  })
}

export const WRONG_CODE_MESSAGE = "That code does not open this book"
