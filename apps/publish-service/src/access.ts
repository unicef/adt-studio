import type { Context, Hono } from "hono"
import { getCookie, setCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import { html, raw } from "hono/html"
import {
  COMMENTER_NAME_MAX_LENGTH,
  PUBLICATION_ACCESS_CODE_LENGTH,
  PUBLICATION_ACCESS_CODE_MAX_LENGTH,
  PUBLICATION_ACCESS_COOKIE,
  PUBLICATION_ACCESS_MAX_AGE_SECONDS,
  type Publication,
} from "@adt/types"
import type { Env } from "./env.js"
import { attemptGate, callerIp } from "./access-throttle.js"
import { errorResponse } from "./errors.js"
import {
  GATE_STRINGS,
  READER_LANGUAGE_KEY,
  readBookLanguages,
  resolveGateLocale,
  stringsFor,
  type GateLanguage,
  type GateLocale,
} from "./gate-i18n.js"
import {
  accessCookieIsValid,
  accessCookieValue,
  normalizeDisplayName,
  verifyAccessCode,
} from "./identity.js"
import type { PublicationVariables } from "./middleware/publication-lookup.js"
import {
  issueSessionCookie,
  storedCommenterFromCookie,
  upsertCommenterSession,
  type SessionDeps,
} from "./sessions.js"
import { normalizeSnapshotPath } from "./snapshot.js"
import type { PublicationStore } from "./store.js"

export type AccessAppEnv = { Bindings: Env; Variables: PublicationVariables }

type AccessContext = Context<AccessAppEnv>

export type AccessRouteDeps = SessionDeps

/**
 * The files a packaged book's cover can be, at the snapshot root. The one exception to the lock:
 * the gate shows the cover so the reader can tell they opened the right book before typing a
 * code, and a page cannot show an image its own door will not let through. Only these exact
 * names pass — nothing inside the book does.
 */
export const COVER_FILES = ["cover.png", "cover.jpg", "cover.jpeg"] as const

/** Which cover file this publication's current version has, if any. */
export async function findCoverFile(
  store: PublicationStore,
  publication: Publication,
): Promise<string | null> {
  for (const file of COVER_FILES) {
    if ((await store.findSnapshotPrefix(publication.token, publication.current_version, file)) !== null) {
      return file
    }
  }
  return null
}

const UNAUTHORIZED_MESSAGE = "This book needs an access code — POST it to /p/:token/access"

const MISSING_SECRET_MESSAGE =
  "This worker has no MGMT_SECRET bound, so it cannot check access codes"

const CODE_FIELD = "code"

const NAME_FIELD = "name"

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

/** Vague on purpose about which limit tripped and how many tries are left: an attacker learns
 *  the shape of the limit from that, and a reviewer only needs to know to wait. */
const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Wait a moment and try again."

export interface GatePageOptions {
  wrongCode?: boolean
  /** Path inside the publication the reader was heading for, so the code prompt does not
   *  swallow the deep link they followed. */
  next?: string | undefined
  /** Echoed back on a wrong code so the visitor retypes the code, not their name. */
  name?: string | null
  /** Refused for guessing too often. A different message from a wrong code, because the reader
   *  who has simply mistyped a few times needs to know that waiting is the answer and that
   *  nothing is broken — not to be told once more that the code is wrong. */
  waiting?: boolean
  /** The cover file at the snapshot root, when the book has one. */
  cover?: string | null
  /** Which language the door speaks — the one the reader will open in. English when absent. */
  locale?: GateLocale
}

/** What the page needs from inside the book: its cover and its languages, read together. */
async function describeBook(
  c: AccessContext,
  store: PublicationStore,
  publication: Publication,
): Promise<{ cover: string | null; locale: GateLocale }> {
  const [cover, languages] = await Promise.all([
    findCoverFile(store, publication),
    readBookLanguages(c, store, publication),
  ])
  return { cover, locale: resolveGateLocale(c, languages) }
}

/**
 * The server can see the reader's saved language only when the book keeps it in a cookie; by
 * default the reader keeps it in local storage. So a book with more than one language also
 * carries its alternatives, and this re-labels the page before it paints — the same precedence
 * as the reader's own `readPersistedLanguage`: local storage first, and a stored language this
 * book does not offer (local storage is shared by every book on the host) means the default.
 */
const LANGUAGE_SCRIPT = html`<script>
(function () {
  var data = document.getElementById("gate-languages")
  if (!data) return
  var raw = null
  try { raw = localStorage.getItem("${READER_LANGUAGE_KEY}") } catch (e) {}
  if (!raw) return
  var stored = raw
  try { var parsed = JSON.parse(raw); if (typeof parsed === "string") stored = parsed } catch (e) {}
  var info = JSON.parse(data.textContent)
  var language = info.map[stored] || info.fallback
  if (language === document.documentElement.lang) return
  var strings = info.strings[language]
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var text = strings[el.getAttribute("data-i18n")]
    if (text) el.textContent = text
  })
  document.documentElement.lang = language
})()
</script>`

function languageData(locale: GateLocale | undefined) {
  if (!locale || locale.book.available.length < 2) return ""
  const strings: Partial<Record<GateLanguage, unknown>> = {}
  for (const language of Object.values(locale.alternatives)) strings[language] = stringsFor(language)
  const fallback = (locale.book.default && locale.alternatives[locale.book.default]) || "en"
  strings[fallback] = stringsFor(fallback)
  const json = JSON.stringify({ map: locale.alternatives, fallback, strings }).replace(/</g, "\\u003c")
  return html`<script type="application/json" id="gate-languages">${raw(json)}</script>${LANGUAGE_SCRIPT}`
}

const LOCK_ICON = html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18"
  height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`

const PERSON_ICON = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/>
  <path d="M4 21a8 8 0 0 1 16 0"/></svg>`

/**
 * Draws the code field as one box per character over the real `<input>`, which stays the only
 * thing that is typed into, pasted into, autofilled and read by a screen reader — the boxes are
 * `aria-hidden` paint. Six boxes to start (the generated length); a longer custom code grows
 * them, and past eight they wrap onto two rows so a twelve-character code still fits a phone.
 * Without script none of this runs and the field is a plain, letter-spaced text input.
 */
const OTP_SCRIPT = html`<script>
(function () {
  var root = document.querySelector(".otp")
  if (!root) return
  var input = root.querySelector("input")
  var min = Number(root.getAttribute("data-min")) || 6
  var max = Number(input.getAttribute("maxlength")) || 12
  var cells = []
  function paint() {
    var value = input.value.replace(/\\s+/g, "").toUpperCase().slice(0, max)
    if (value !== input.value) {
      var at = input.selectionStart
      input.value = value
      if (at !== null) input.setSelectionRange(Math.min(at, value.length), Math.min(at, value.length))
    }
    var count = Math.min(max, Math.max(min, value.length))
    while (cells.length < count) {
      var cell = document.createElement("span")
      cell.className = "cell"
      cell.setAttribute("aria-hidden", "true")
      root.appendChild(cell)
      cells.push(cell)
    }
    while (cells.length > count) root.removeChild(cells.pop())
    root.style.setProperty("--cols", String(count > 8 ? Math.ceil(count / 2) : count))
    var caret = input.selectionStart === null ? value.length : input.selectionStart
    cells.forEach(function (cell, i) {
      var ch = value.charAt(i)
      if (cell.textContent !== ch) {
        cell.textContent = ch
        cell.classList.toggle("filled", ch !== "")
      }
      cell.classList.toggle("active", i === Math.min(caret, count - 1))
    })
  }
  input.addEventListener("input", function () { root.classList.remove("invalid"); paint() })
  input.addEventListener("focus", function () { root.classList.add("focused"); paint() })
  input.addEventListener("blur", function () { root.classList.remove("focused") })
  ;["keyup", "click", "select"].forEach(function (type) { input.addEventListener(type, paint) })
  document.documentElement.classList.add("otp-ready")
  paint()
  if (document.activeElement === input) root.classList.add("focused")
})()
</script>`

/** The backdrop for a book with no cover, and for one whose cover failed to load. */
const FALLBACK_BACKDROP =
  "radial-gradient(60% 60% at 30% 20%,#6366f1,transparent),radial-gradient(60% 60% at 80% 90%,#a855f7,transparent),#312e81"

/**
 * The cover is the one thing on the page fetched separately, and on a slow connection it can
 * arrive well after the card. Until it does, the book keeps its shape — page edges, back board —
 * with a shimmer across a blank front, and the blurred backdrop waits too; both fade in when the
 * image lands. A cover that fails to load turns into the plain locked book rather than a
 * broken image. Without script the image simply appears when it arrives.
 */
const COVER_SCRIPT = html`<script>
(function () {
  var front = document.querySelector(".front.loading")
  var img = front && front.querySelector("img")
  if (!img) return
  var root = document.documentElement
  function done(ok) {
    front.classList.remove("loading")
    root.classList.remove("cover-pending")
    if (ok) {
      front.classList.add("loaded")
      return
    }
    front.classList.add("failed")
    root.classList.add("cover-failed")
    front.querySelector(".face.plain").hidden = false
  }
  if (img.complete) return done(img.naturalWidth > 0)
  img.addEventListener("load", function () { done(true) })
  img.addEventListener("error", function () { done(false) })
})()
</script>`

/**
 * The access-code page: a whole document in one response, inline-styled, so it renders
 * identically whether the reader arrived before any of the snapshot's own assets loaded or after
 * the link was locked mid-visit. Its only script is the inline code-box painter above, and the
 * page works without it. Deliberately English (the M1a.5 callback-page precedent — worker-served
 * pages sit outside the Lingui catalogs); see the contract's §4.15 note for the localisation
 * follow-up.
 *
 * The book's own cover, blurred, fills the page; the cover again, as a standing hardback, sits
 * beside one card that holds everything the reader has to read and type. Every word is on that
 * card rather than on the backdrop, so a pale or busy cover can never wash the text out.
 *
 * Since worker 0.5.1 it also asks for the visitor's name, so commenter identity is established
 * at the door and the pin composer never has to interrupt a half-typed comment to ask.
 */
function gatePage(publication: Publication, options: GatePageOptions = {}) {
  const title = publication.title
  const wrong = options.wrongCode === true
  const waiting = options.waiting === true
  const failed = wrong || waiting
  const cover = options.cover ?? null
  const coverUrl = cover ? `/p/${publication.token}/${cover}` : null
  const locale = options.locale
  const t = locale?.strings ?? GATE_STRINGS.en
  const language = locale?.language ?? "en"
  const titleLanguage = locale?.book.default ?? locale?.bookLanguage ?? null
  return html`<!doctype html>
<html lang="${language}"${coverUrl ? html` class="cover-pending"` : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script>document.documentElement.classList.add("js")</script>
<title>${title}</title>
<style>
  :root { color-scheme:light; --brand:#4f46e5; --brand-dark:#4338ca; --ink:#18181b; --muted:#52525b; --soft:#eef2ff }
  * { box-sizing:border-box }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:1.5rem;
         position:relative; overflow-x:hidden; background:#1e1b4b; color:var(--ink);
         font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif }
  body::before { content:""; position:fixed; inset:-40px; z-index:0; transform:scale(1.1); opacity:.75;
                 filter:blur(40px) saturate(1.3); transition:opacity .8s ease;
                 background:${coverUrl
                   ? html`url("${coverUrl}") center/cover`
                   : FALLBACK_BACKDROP} }
  .js.cover-pending body::before { opacity:0 }
  .cover-failed body::before { background:${FALLBACK_BACKDROP} }
  body::after { content:""; position:fixed; inset:0; z-index:0;
                background:linear-gradient(90deg, rgba(10,10,30,.62), rgba(10,10,30,.25) 60%, rgba(10,10,30,.2)) }
  .scene { position:relative; z-index:1; width:100%; max-width:66rem; display:grid; grid-template-columns:1fr auto;
           align-items:center; gap:4.5rem }
  main { max-width:29rem; padding:2.25rem 2.25rem 2rem; border-radius:1.5rem; background:rgba(255,255,255,.92);
         backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,.6);
         box-shadow:0 30px 60px -25px rgba(0,0,0,.6); animation:rise .35s ease-out both }
  h1 { margin:.9rem 0 .55rem; font-size:2.2rem; line-height:1.12; letter-spacing:-.015em;
       overflow-wrap:anywhere; word-break:break-word; hyphens:auto; text-wrap:balance }
  p { margin:0; line-height:1.55; color:var(--muted) }
  .intro { font-size:1.02rem }
  .badge { display:inline-flex; align-items:center; gap:.35rem; padding:.2rem .6rem; border-radius:999px;
           background:var(--soft); color:var(--brand-dark); font-size:.75rem; font-weight:600 }
  form { margin-top:1.6rem; display:flex; flex-direction:column; gap:.9rem }
  .field { display:flex; flex-direction:column; gap:.4rem }
  label { font-size:.8125rem; font-weight:500; color:var(--muted) }
  .text { width:100%; padding:.72rem .8rem .72rem 2.4rem; font:inherit; font-size:1rem; border:1px solid #d4d4d8;
          border-radius:.65rem; background:#fff; color:inherit; transition:border-color .15s, box-shadow .15s }
  .text:focus { outline:none; border-color:var(--brand); box-shadow:0 0 0 3px rgba(79,70,229,.18) }
  .iconfield { position:relative }
  .iconfield svg { position:absolute; left:.8rem; top:50%; transform:translateY(-50%); color:#71717a; pointer-events:none }
  .otp { position:relative }
  .otp input { width:100%; padding:.72rem .8rem; font:600 1.15rem/1.2 ui-monospace,'SF Mono',Menlo,monospace;
               letter-spacing:.3em; text-align:center; text-transform:uppercase; border:1px solid #d4d4d8;
               border-radius:.65rem; background:#fff; color:inherit }
  .otp input:focus { outline:none; border-color:var(--brand); box-shadow:0 0 0 3px rgba(79,70,229,.18) }
  .otp.invalid input { border-color:#dc2626 }
  .otp-ready .otp { display:grid; grid-template-columns:repeat(var(--cols,6),1fr); gap:.45rem }
  .otp-ready .otp input { position:absolute; inset:0; z-index:1; height:100%; opacity:0; caret-color:transparent;
                          font-size:16px; padding:0; border:0; cursor:text }
  .cell { height:3rem; display:flex; align-items:center; justify-content:center;
          font:600 1.3rem/1 ui-monospace,'SF Mono',Menlo,monospace; border:1px solid #d4d4d8; border-radius:.65rem;
          background:#fff; transition:border-color .15s, box-shadow .15s }
  .cell.filled { animation:pop .18s ease-out }
  .otp.focused .cell.active { border-color:var(--brand); box-shadow:0 0 0 3px rgba(79,70,229,.18) }
  .otp.focused .cell.active:not(.filled)::after { content:""; width:2px; height:1.35rem; border-radius:1px;
                                                   background:var(--brand); animation:blink 1s steps(1) infinite }
  .otp.invalid .cell { border-color:#dc2626; animation:nudge .28s ease-in-out both }
  .hint { font-size:.8125rem; color:var(--muted) }
  .error { font-size:.875rem; line-height:1.5; color:#b91c1c } .error.waiting { color:#854d0e }
  button { margin-top:.4rem; padding:.78rem 1rem; font:inherit; font-weight:600; color:#fff; background:var(--brand);
           border:0; border-radius:.65rem; cursor:pointer; transition:background-color .15s, transform .12s }
  button:hover { background:var(--brand-dark) } button:active { transform:translateY(1px) }
  button:focus-visible { outline:3px solid #a5b4fc; outline-offset:2px }
  .art { padding-right:2rem }
  .stand { position:relative; perspective:1400px; animation:appear .6s ease-out both }
  .stand::after { content:""; position:absolute; left:4%; right:-10%; bottom:-1.3rem; height:2rem; border-radius:50%;
                  z-index:-1; background:radial-gradient(closest-side, rgba(0,0,0,.55), rgba(0,0,0,0)); filter:blur(4px) }
  .book { --bh:28rem; --t:40px; position:relative; transform-style:preserve-3d; transform:rotateY(-34deg) rotateX(4deg);
          animation:settle 1.1s cubic-bezier(.2,.8,.2,1) both }
  .front { position:relative; transform:translateZ(calc(var(--t) / 2)); border-radius:2px 5px 5px 2px; overflow:hidden;
           box-shadow:0 0 0 1px rgba(0,0,0,.08) }
  .face { display:block; height:var(--bh); width:auto; max-width:calc(var(--bh) * .8) }
  .face.plain[hidden] { display:none }
  .js .front.loading { width:calc(var(--bh) * .7); height:var(--bh); background:linear-gradient(155deg,#ecebf5,#d8d5e8) }
  .js .front.loading::before { content:""; position:absolute; inset:0; z-index:1;
      background:linear-gradient(100deg, rgba(255,255,255,0) 30%, rgba(255,255,255,.6) 50%, rgba(255,255,255,0) 70%);
      background-size:250% 100%; animation:shimmer 1.4s linear infinite }
  .js .front.loading .face.cover { position:absolute; inset:0; opacity:0 }
  .front.loaded .face.cover { animation:fade .5s ease-out both }
  .front.failed .face.cover { display:none }
  .cover-failed .back { background:#312e81 }
  .face.plain { width:calc(var(--bh) * .68); display:flex; flex-direction:column; justify-content:space-between;
                padding:8% 7% 8% 9%; background:linear-gradient(155deg,#4f46e5,#312e81 70%); color:#fff }
  .face.plain b { font-size:calc(var(--bh) * .06); line-height:1.2; overflow-wrap:anywhere; hyphens:auto }
  .face.plain span { width:calc(var(--bh) * .125); height:calc(var(--bh) * .125); border-radius:999px; display:flex;
                     align-items:center; justify-content:center; background:rgba(255,255,255,.15) }
  .face.plain svg { width:45%; height:45% }
  .hinge, .gloss { position:absolute; inset:0; pointer-events:none }
  .hinge { background:linear-gradient(90deg, rgba(0,0,0,.32) 0, rgba(0,0,0,.06) 1.4%, rgba(255,255,255,.3) 2.4%,
                                      rgba(0,0,0,.16) 3.8%, rgba(0,0,0,0) 7%) }
  .gloss { background:linear-gradient(110deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 32%, rgba(0,0,0,0) 72%,
                                      rgba(0,0,0,.14) 100%) }
  .pages { position:absolute; top:4px; bottom:4px; right:0; width:var(--t);
           transform:translateX(calc(var(--t) / 2 - 5px)) rotateY(90deg);
           background:linear-gradient(90deg, rgba(0,0,0,.22), rgba(0,0,0,0) 25%, rgba(0,0,0,0) 80%, rgba(0,0,0,.18)),
                      repeating-linear-gradient(90deg, #fbf9f4 0 1.5px, #e4ddcc 1.5px 2.5px) }
  .back { position:absolute; inset:0; transform:translateZ(calc(var(--t) / -2)); border-radius:2px 5px 5px 2px;
          filter:brightness(.42) saturate(1.1);
          background:${coverUrl ? html`url("${coverUrl}") center/cover` : "#312e81"} }
  @keyframes rise { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
  @keyframes appear { from { opacity:0 } }
  @keyframes fade { from { opacity:0 } }
  @keyframes shimmer { from { background-position:100% 0 } to { background-position:-150% 0 } }
  @keyframes settle { from { transform:rotateY(-62deg) rotateX(8deg) translateY(14px) } }
  @keyframes pop { from { transform:scale(.92) } to { transform:none } }
  @keyframes blink { 50% { opacity:0 } }
  @keyframes nudge { 25% { transform:translateX(-4px) } 75% { transform:translateX(4px) } }
  @media (max-width: 860px) {
    body { padding:1.25rem }
    .scene { grid-template-columns:1fr; gap:1.5rem; max-width:23rem }
    .art { order:-1; padding:0; display:flex; justify-content:center; margin-bottom:1rem }
    .book { --bh:10.5rem; --t:20px } .stand::after { bottom:-.9rem; height:1.4rem }
    main { padding:1.5rem 1.4rem 1.6rem }
    h1 { font-size:1.4rem } .intro { font-size:.9375rem }
  }
  @media (prefers-reduced-motion: reduce) { *, *::after { animation:none !important; transition:none !important } }
</style></head>
<body>
<div class="scene">
  <main>
    <span class="badge">${LOCK_ICON}<span data-i18n="badge">${t.badge}</span></span>
    <h1${titleLanguage ? html` lang="${titleLanguage}"` : ""} dir="auto">${title}</h1>
    <p class="intro" data-i18n="intro">${t.intro}</p>
    <form method="post" action="/p/${publication.token}/access">
      <input type="hidden" name="${NEXT_FIELD}" value="${options.next ?? ""}">
      <div class="field">
        <label for="name" data-i18n="nameLabel">${t.nameLabel}</label>
        <div class="iconfield">${PERSON_ICON}<input class="text" id="name" name="${NAME_FIELD}"${failed ? "" : html` autofocus`}
               required autocomplete="name" spellcheck="false" enterkeyhint="next" maxlength="${COMMENTER_NAME_MAX_LENGTH}"
               value="${options.name ?? ""}"></div>
      </div>
      <div class="field">
        <label for="code" data-i18n="codeLabel">${t.codeLabel}</label>
        <div class="otp${wrong && !waiting ? " invalid" : ""}" data-min="${PUBLICATION_ACCESS_CODE_LENGTH}">
          <input id="code" name="${CODE_FIELD}" required autocomplete="off" autocapitalize="characters"
                 spellcheck="false" enterkeyhint="go" maxlength="${PUBLICATION_ACCESS_CODE_MAX_LENGTH}"
                 aria-describedby="${failed ? "code-error code-hint" : "code-hint"}"${failed ? html` autofocus` : ""}${wrong ? html` aria-invalid="true"` : ""}>
        </div>
      </div>
      ${
        waiting
          ? html`<p class="error waiting" id="code-error" role="alert" data-i18n="waiting">${t.waiting}</p>`
          : wrong
            ? html`<p class="error" id="code-error" role="alert" data-i18n="wrongCode">${t.wrongCode}</p>`
            : ""
      }
      <p class="hint" id="code-hint" data-i18n="hint">${t.hint}</p>
      <button type="submit" data-i18n="button">${t.button}</button>
    </form>
  </main>
  <div class="art" aria-hidden="true"><div class="stand"><div class="book">
    <div class="back"></div><div class="pages"></div>
    <div class="front${coverUrl ? " loading" : ""}">${
      coverUrl ? html`<img class="face cover" src="${coverUrl}" alt="">` : ""
    }<div class="face plain lock"${coverUrl ? html` hidden` : ""}><span>${LOCK_ICON}</span><b>${title}</b></div><span
      class="hinge"></span><span class="gloss"></span></div>
  </div></div></div>
</div>
${languageData(locale)}${coverUrl ? COVER_SCRIPT : ""}${OTP_SCRIPT}
</body></html>
`
}

/**
 * Everything under `/p/:token/` is behind this once the publication has a code: pages, assets
 * and the comments API alike. It runs *after* the lookup ladder, so a revoked link still
 * answers `410` rather than asking for a code it would refuse anyway, and `MGMT_SECRET` walks
 * straight through — the author reads their own feedback through these routes.
 */
/**
 * "Is this request allowed past the door?" — the gate's own condition, factored out so the
 * realtime room route (§4.16), which has to sit *ahead* of the middleware to accept its own
 * alternative credential, can ask exactly the same question rather than a similar one.
 */
export async function accessGranted(c: AccessContext): Promise<boolean> {
  const packed = c.get("accessCodeHash")
  if (packed === null || c.get("isAuthor")) return true

  const secret = c.env?.MGMT_SECRET
  if (secret === undefined) return false

  return accessCookieIsValid(
    getCookie(c, PUBLICATION_ACCESS_COOKIE),
    c.get("publication").token,
    packed,
    secret,
  )
}

export function createAccessGate(resolveStore: (env: Env) => PublicationStore) {
  return createMiddleware<AccessAppEnv>(async (c, next) => {
    if (await accessGranted(c)) return next()

    const publication = c.get("publication")

    if (!wantsHtml(c)) {
      return errorResponse(c, "unauthorized", 401, UNAUTHORIZED_MESSAGE)
    }

    const book = await describeBook(c, resolveStore(c.env), publication)
    return c.html(gatePage(publication, { next: currentRelative(c, publication.token), ...book }), 401)
  })
}

interface AccessSubmission {
  code: string
  /** Already through the session routes' own normaliser, so a name that could not become an
   *  identity is indistinguishable here from one that was never sent. */
  name: string | null
  next: string | undefined
}

const EMPTY_SUBMISSION: AccessSubmission = { code: "", name: null, next: undefined }

function fieldOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

async function readSubmission(c: AccessContext): Promise<AccessSubmission> {
  const contentType = c.req.header("content-type") ?? ""
  if (contentType.includes("json")) {
    try {
      const body = (await c.req.json()) as Record<string, unknown>
      return {
        code: fieldOf(body[CODE_FIELD])?.slice(0, 256) ?? "",
        name: normalizeDisplayName(fieldOf(body[NAME_FIELD])),
        next: undefined,
      }
    } catch {
      return EMPTY_SUBMISSION
    }
  }

  try {
    const body = await c.req.parseBody()
    return {
      code: fieldOf(body[CODE_FIELD])?.slice(0, 256) ?? "",
      name: normalizeDisplayName(fieldOf(body[NAME_FIELD])),
      next: fieldOf(body[NEXT_FIELD]),
    }
  } catch {
    return EMPTY_SUBMISSION
  }
}

export function registerAccessRoute(app: Hono<AccessAppEnv>, deps: AccessRouteDeps): void {
  /**
   * Identity at the door (0.5.1): the visitor named themselves to get in, so the same response
   * that grants admission also carries a commenter session and the composer never asks again.
   * A visitor who comes back through the gate is *renamed*, not duplicated — the request's own
   * session cookie is the difference, exactly as on a re-POST to `/p/:token/session`.
   *
   * A name that cannot be taken (the dormant pinned-name reservation) still opens the book: the
   * code was right, and the door is about admission. The session simply keeps the name it had.
   */
  const establishIdentity = async (
    c: AccessContext,
    token: string,
    name: string,
    secret: string,
  ): Promise<void> => {
    const store = deps.resolveStore(c.env)
    const existing = await storedCommenterFromCookie(c, store, token)
    const outcome = await upsertCommenterSession({ store, deps, token, name, existing })
    if (!outcome.ok) return
    await issueSessionCookie(c, token, outcome.session.id, secret)
  }

  /** Registered before `accessGate` on purpose: the door cannot be behind the lock. */
  app.post("/p/:token/access", async (c) => {
    const publication = c.get("publication")
    const packed = c.get("accessCodeHash")
    const secret = c.env?.MGMT_SECRET
    const { code, name, next } = await readSubmission(c)
    const isForm = !(c.req.header("content-type") ?? "").includes("json")

    /**
     * Checked before the comparison, for the same reason the comparison always runs: a refused
     * attempt must cost the same as any other and reveal nothing by how long it took. The code
     * *is* the door here — unauthenticated by construction — so 32^6 is only worth what the
     * worker's willingness to keep answering makes it.
     *
     * Skipped entirely when there is no code (`packed === null`): a link with no door to force
     * has nothing to throttle, and starting a counter for it anyway would refuse a codeless
     * publication's own visitors for no reason once enough of them passed through.
     */
    const gate =
      packed === null || secret === undefined
        ? null
        : await attemptGate({
            store: deps.resolveStore(c.env),
            secret,
            ip: callerIp(c.req.raw.headers),
            token: publication.token,
            kind: "access",
            now: new Date(deps.timestamp()),
          })

    if (gate && gate.refusedFor !== null) {
      c.header("Retry-After", String(gate.refusedFor))
      return isForm
        ? c.html(
            gatePage(publication, {
              wrongCode: true,
              next,
              name,
              waiting: true,
              ...(await describeBook(c, deps.resolveStore(c.env), publication)),
            }),
            429,
          )
        : errorResponse(c, "rate_limited", 429, TOO_MANY_ATTEMPTS_MESSAGE)
    }

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
      /** No explicit "record this failure" call: `attemptGate` above already wrote this
       *  attempt's own row before it told us whether we were refused — see access-throttle.ts. */
      return isForm
        ? c.html(
            gatePage(publication, {
              wrongCode: true,
              next,
              name,
              ...(await describeBook(c, deps.resolveStore(c.env), publication)),
            }),
            401,
          )
        : errorResponse(c, "unauthorized", 401, WRONG_CODE_MESSAGE)
    }
    await gate?.recordSuccess()

    setCookie(
      c,
      PUBLICATION_ACCESS_COOKIE,
      await accessCookieValue(publication.token, packed, secret, new Date(deps.timestamp())),
      {
        path: `/p/${publication.token}`,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: PUBLICATION_ACCESS_MAX_AGE_SECONDS,
      },
    )

    if (name !== null) {
      await establishIdentity(c, publication.token, name, secret)
    }

    /** `c.body`, never a bare `new Response`: both cookies live in the context's prepared
     *  headers until the response is built through it. */
    return isForm
      ? c.redirect(safeNext(publication.token, next), 303)
      : c.body(null, 204)
  })
}

const WRONG_CODE_MESSAGE = "That code does not open this book"
