// Screenshots of the review-screen variants (v-*) into prototypes/v-*/shots/ (JPEG, to keep the repo small).
// Run from experiments/setup-recommender: node prototypes/_build/shots-confirm.mjs [v-folder]
import { chromium } from "../../../../node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs"
import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const P = dirname(dirname(fileURLToPath(import.meta.url)))
const V = "storybook-1930-el-viaje", H = "storybook-hyena-and-raven", C = "storybook-colouring-my-school", T = "textbook-praticas-de-alfabetizacao-e-de-matematica"
const E = "textbook-egito-antigo", R = "reference-reimagining-target-aware-molecular"
// El Viaje uses the whole-book reading as the shown pick (src=whole): there the AI is wrong ("information to read").
const common = [
  ["01-el-viaje-ai-wrong", `book=${V}&src=whole`],
  ["02-el-viaje-said-story", `book=${V}&src=whole&a=genre:story`],
  ["03-el-viaje-answered", `book=${V}&src=whole&a=genre:story,composition:text-mostly,diagrams:none`],
  ["04-egypt-guesses-differ", `book=${E}`],
  ["05-egypt-said-school-book", `book=${E}&a=genre:textbook`],
  ["06-my-school-looks-right", `book=${C}`],
  ["07-my-school-changed-kind", `book=${C}&a=genre:textbook`],
  ["08-hyena-changed-maps-locked", `book=${H}&a=diagrams:some`],
  ["09-praticas-looks-right", `book=${T}`],
  ["10-research-paper-looks-right", `book=${R}`],
  ["11-el-viaje-phone", `book=${V}&src=whole`, { phone: true }],
  ["12-egypt-dark", `book=${E}&theme=dark`],
]
const extra = {
  "v-picks-list": [
    ["13-el-viaje-p0-never-ask", `book=${V}&src=whole&policy=P0`],
    ["14-hyena-created", `book=${H}&created`, { full: false }],
    ["15-my-school-phone", `book=${C}`, { phone: true }],
  ],
  "v-result-first": [
    ["13-hyena-list-open", `book=${H}&list`],
    ["14-my-school-phone", `book=${C}`, { phone: true }],
  ],
  "v-sure-unsure": [
    ["13-egypt-p4-highlight-only", `book=${E}&policy=P4`],
    ["14-my-school-sure-open", `book=${C}&sure&open=f:genre`],
    ["15-my-school-phone", `book=${C}`, { phone: true }],
  ],
  "v-settings": [
    ["13-hyena-change-layout", `book=${H}&open=s:renderStrategy`],
    ["14-praticas-change-activities", `book=${T}&open=s:activitiesGenerator`],
    ["15-my-school-phone", `book=${C}`, { phone: true }],
  ],
  "v-sentence": [
    ["13-hyena-open-words", `book=${H}&open=f:composition`],
    ["14-my-school-phone", `book=${C}`, { phone: true }],
  ],
}

const browser = await browser0()
async function browser0() { return chromium.launch() }
const only = process.argv[2]
for (const dir of Object.keys(extra)) {
  if (only && dir !== only) continue
  const out = join(P, dir, "shots")
  mkdirSync(out, { recursive: true })
  for (const f of readdirSync(out)) rmSync(join(out, f))
  for (const [name, q, o = {}] of [...common, ...extra[dir]]) {
    const page = await browser.newPage({ viewport: o.phone ? { width: 390, height: 844 } : { width: 1280, height: 860 }, deviceScaleFactor: 1 })
    const errs = []
    page.on("pageerror", (e) => errs.push(e.message))
    await page.goto(pathToFileURL(join(P, dir, "index.html")).href + "?" + q)
    if (o.full !== false) await page.addStyleTag({ content: ".dock{position:static!important}" })
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(out, name + ".jpg"), fullPage: o.full !== false, type: "jpeg", quality: 82 })
    console.log(dir, name, errs.length ? "ERR " + errs.join("; ") : "ok")
    await page.close()
  }
}
await browser.close()
