import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { CreateValidationShare, SubmitValidationShareFeedback, parseBookLabel } from "@adt/types"
import {
  createValidationShare,
  listValidationShareFeedback,
  listValidationShares,
  requireActiveValidationShare,
  publishValidationShareVersion,
  revokeValidationShare,
  saveValidationShareFeedback,
} from "../services/validation-share-service.js"

function readPackageVersion(label: string, booksDir: string) {
  const safeLabel = parseBookLabel(label)
  const versionPath = path.join(path.resolve(booksDir), safeLabel, "adt", ".build-version")
  if (!fs.existsSync(versionPath)) throw new HTTPException(409, { message: "Package the ADT preview before sharing it" })
  const version = fs.readFileSync(versionPath, "utf8").trim()
  if (!version) throw new HTTPException(409, { message: "Package the ADT preview before sharing it" })
  return { safeLabel, version }
}

function publicBaseUrl(requestUrl: string) {
  return (process.env.VALIDATION_PUBLIC_BASE_URL || new URL(requestUrl).origin).replace(/\/$/, "")
}

function isPubliclyReachable(url: string) {
  const hostname = new URL(url).hostname
  return !["localhost", "127.0.0.1", "::1"].includes(hostname)
}

function renderSharedValidationPage(label: string, token: string, version: string, expiresAt: string) {
  const previewUrl = `/api/books/${encodeURIComponent(label)}/adt/v-${encodeURIComponent(version)}/index.html`
  const feedbackUrl = `/api/public/validation/${encodeURIComponent(label)}/${encodeURIComponent(token)}/feedback`
  const scriptData = JSON.stringify({ feedbackUrl })
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ADT book validation</title><style>
*{box-sizing:border-box}body{margin:0;font:16px system-ui,sans-serif;background:#f8fafc;color:#172033}.bar{display:flex;gap:1rem;align-items:center;padding:.75rem 1rem;background:#fff;border-bottom:1px solid #dbe3ed}.bar strong{margin-right:auto}.layout{height:calc(100vh - 59px);display:grid;grid-template-columns:minmax(0,1fr) 22rem}.preview{width:100%;height:100%;border:0;background:#fff}.panel{padding:1rem;overflow:auto;border-left:1px solid #dbe3ed;background:#fff}label{display:block;font-weight:600;margin:.8rem 0 .3rem}input,select,textarea,button{width:100%;font:inherit;padding:.65rem;border:1px solid #9aa7b8;border-radius:.45rem}textarea{min-height:9rem;resize:vertical}button{margin-top:1rem;background:#087f5b;color:#fff;border:0;font-weight:700;cursor:pointer}button:focus,input:focus,select:focus,textarea:focus{outline:3px solid #66d9b7;outline-offset:2px}.hint,.status{font-size:.875rem;color:#526175}.status{min-height:1.3rem;margin-top:.75rem}@media(max-width:800px){.layout{height:auto;display:block}.preview{height:70vh}.panel{border-left:0;border-top:1px solid #dbe3ed}}
</style></head><body>
<header class="bar"><strong>ADT book validation</strong><span>Link expires ${new Date(expiresAt).toLocaleDateString("en")}</span></header>
<main class="layout"><iframe id="preview" class="preview" src="${previewUrl}" title="Book preview"></iframe>
<aside class="panel" aria-labelledby="feedback-title"><h1 id="feedback-title">Send feedback</h1><p class="hint">Play the narration and sign-language videos in the preview. Your note is saved directly in ADT for the expert.</p>
<form id="feedback"><label for="reviewer">Your name</label><input id="reviewer" name="reviewer_name" required maxlength="200" autocomplete="name">
<label for="category">Area</label><select id="category" name="category"><option value="content">Content</option><option value="voice">Voice or narration</option><option value="sign-language">Sign language</option><option value="accessibility">Accessibility</option><option value="other">Other</option></select>
<label for="comment">Correction or comment</label><textarea id="comment" name="comment" required maxlength="10000"></textarea>
<button type="submit">Send to ADT expert</button><p id="status" class="status" role="status" aria-live="polite"></p></form></aside></main>
<script>const DATA=${scriptData};const form=document.getElementById('feedback'),status=document.getElementById('status'),frame=document.getElementById('preview');form.addEventListener('submit',async(e)=>{e.preventDefault();status.textContent='Sending…';let page_href;try{page_href=frame.contentWindow.location.pathname}catch{}const body=Object.fromEntries(new FormData(form));body.page_href=page_href;const res=await fetch(DATA.feedbackUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(res.ok){form.comment.value='';status.textContent='Feedback sent. Thank you.'}else{status.textContent='Could not send feedback. Please retry.'}});</script>
</body></html>`
}

export function createValidationShareRoutes(booksDir: string): Hono {
  const app = new Hono()

  app.get("/books/:label/validation/shares", (c) => {
    const shares = listValidationShares(c.req.param("label"), booksDir)
    const feedback = listValidationShareFeedback(c.req.param("label"), booksDir)
    return c.json({ shares, feedback })
  })

  app.post("/books/:label/validation/shares", async (c) => {
    const parsed = CreateValidationShare.safeParse(await c.req.json<unknown>())
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message })
    const { safeLabel, version } = readPackageVersion(c.req.param("label"), booksDir)
    const created = createValidationShare(safeLabel, booksDir, version, parsed.data.expires_in_days)
    const baseUrl = publicBaseUrl(c.req.url)
    return c.json({
      version: created.version,
      share: created.share,
      url: `${baseUrl}/api/public/validation/${encodeURIComponent(safeLabel)}/${encodeURIComponent(created.token)}`,
      publicly_reachable: isPubliclyReachable(baseUrl),
    }, 201)
  })

  app.post("/books/:label/validation/shares/:shareId/revoke", (c) =>
    c.json(revokeValidationShare(c.req.param("label"), booksDir, c.req.param("shareId"))),
  )

  app.post("/books/:label/validation/shares/:shareId/publish", (c) => {
    const { safeLabel, version } = readPackageVersion(c.req.param("label"), booksDir)
    return c.json(publishValidationShareVersion(safeLabel, booksDir, c.req.param("shareId"), version))
  })

  app.get("/public/validation/:label/:token", (c) => {
    const entry = requireActiveValidationShare(c.req.param("label"), booksDir, c.req.param("token"))
    c.header("Content-Type", "text/html; charset=utf-8")
    c.header("Cache-Control", "no-store")
    c.header("X-Robots-Tag", "noindex, nofollow")
    return c.body(renderSharedValidationPage(c.req.param("label"), c.req.param("token"), entry.share.package_version, entry.share.expires_at))
  })

  app.post("/public/validation/:label/:token/feedback", async (c) => {
    const share = requireActiveValidationShare(c.req.param("label"), booksDir, c.req.param("token"))
    const parsed = SubmitValidationShareFeedback.safeParse(await c.req.json<unknown>())
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message })
    return c.json(saveValidationShareFeedback(c.req.param("label"), booksDir, share.share.share_id, parsed.data), 201)
  })

  return app
}
