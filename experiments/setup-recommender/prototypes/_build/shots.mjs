// Screenshots of every prototype state into prototypes/<direction>/shots/.
// Run from experiments/setup-recommender: node prototypes/_build/shots.mjs
import { chromium } from "../../../../node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs"
import { mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const P = dirname(dirname(fileURLToPath(import.meta.url)))
const V = "storybook-1930-el-viaje", H = "storybook-hyena-and-raven", C = "storybook-colouring-my-school", T = "textbook-praticas-de-alfabetizacao-e-de-matematica"
const E = "textbook-egito-antigo", R = "reference-reimagining-target-aware-molecular"
const r3 = {
  "r3-check-then-ask": [
    ["01-el-viaje-reading-slow", `book=${V}&stage=reading&t=3&slow`],
    ["02-el-viaje-q1-kind", `book=${V}`],
    ["03-el-viaje-q2-words", `book=${V}&a=genre:story`],
    ["04-el-viaje-q3-maps-locked", `book=${V}&a=genre:story,composition:text-mostly`],
    ["05-el-viaje-done", `book=${V}&a=genre:story,composition:text-mostly,diagrams:none`],
    ["06-el-viaje-picked-school-book", `book=${V}&a=genre:textbook`],
    ["07-egypt-q1-kind", `book=${E}`],
    ["08-egypt-said-story-while-waiting", `book=${E}&told=genre:story`],
    ["09-my-school-looks-right", `book=${C}`],
    ["10-praticas-looks-right", `book=${T}`],
    ["11-hyena-looks-right", `book=${H}`],
    ["12-research-paper-looks-right", `book=${R}`],
    ["13-egypt-choose-pages", `book=${E}&dialog=range&draft=sugg`, { full: false }],
    ["14-egypt-pages-chosen-create", `book=${E}&a=genre:textbook&pages=1,3-10&dialog=create`, { full: false }],
    ["15-long-book-strip-sketch", `book=${H}&stage=reading&long`],
    ["16-el-viaje-q3-phone", `book=${V}&a=genre:story,composition:text-mostly`, { phone: true }],
    ["17-my-school-phone", `book=${C}`, { phone: true }],
    ["18-el-viaje-q1-dark", `book=${V}&theme=dark`],
  ],
  "r3-tell-while-reading": [
    ["01-el-viaje-tell-while-reading", `book=${V}&stage=reading&t=3&told=genre:story`],
    ["02-el-viaje-told-both", `book=${V}&told=genre:story,composition:text-mostly`],
    ["03-el-viaje-done", `book=${V}&told=genre:story,composition:text-mostly&a=diagrams:none`],
    ["04-egypt-told-school-book", `book=${E}&told=genre:textbook,exercises:none,composition:text-beside-art`],
    ["05-egypt-told-story-conflict", `book=${E}&told=genre:story`],
    ["06-hyena-told-on-picture-conflict", `book=${H}&told=genre:story,composition:text-in-art`],
    ["07-hyena-skipped-telling", `book=${H}`],
    ["08-el-viaje-skipped-telling", `book=${V}`],
    ["09-tell-phone", `book=${E}&stage=reading&t=3&told=genre:textbook`, { phone: true }],
    ["10-conflict-dark", `book=${H}&told=genre:story,composition:text-in-art&theme=dark`],
  ],
  "r3-teach-me": [
    ["01-hyena-step1-kind-sure", `book=${H}`],
    ["02-hyena-step2-words", `book=${H}&a=genre:story`],
    ["03-hyena-step3-maps-locked", `book=${H}&a=genre:story,composition:text-beside-art`],
    ["04-hyena-done", `book=${H}&a=genre:story,composition:text-beside-art,diagrams:none`],
    ["05-el-viaje-step1-unsure", `book=${V}`],
    ["06-praticas-step1", `book=${T}`],
    ["07-teach-phone", `book=${C}&a=genre:story`, { phone: true }],
    ["08-teach-dark", `book=${H}&theme=dark&a=genre:story`],
  ],
}
const shots = {
  ...r3,
  "check-then-ask": [
    ["01-el-viaje-reading", `book=${V}&stage=reading&t=3`],
    ["02-el-viaje-read-done", `book=${V}&stage=reading`],
    ["03-el-viaje-q1-kind", `book=${V}`],
    ["04-el-viaje-q2-words", `book=${V}&a=genre:story`],
    ["05-el-viaje-done", `book=${V}&a=genre:story,composition:text-mostly`],
    ["06-el-viaje-said-story-while-waiting", `book=${V}&kind=story`],
    ["07-egypt-q1-kind", `book=${E}`],
    ["08-egypt-done-school-book", `book=${E}&a=genre:textbook`],
    ["09-egypt-said-school-book-while-waiting", `book=${E}&kind=textbook`],
    ["10-my-school-looks-right", `book=${C}`],
    ["11-my-school-change-exercises", `book=${C}&edit=exercises`],
    ["12-my-school-walk-me-through", `book=${C}&walk=1`],
    ["13-praticas-looks-right", `book=${T}`],
    ["14-hyena-looks-right", `book=${H}`],
    ["15-el-viaje-choose-pages", `book=${V}&a=genre:story,composition:text-mostly&dialog=range`, { full: false }],
    ["16-el-viaje-create", `book=${V}&a=genre:story,composition:text-mostly&from=2&dialog=create`, { full: false }],
    ["17-el-viaje-q1-phone", `book=${V}`, { phone: true }],
    ["18-my-school-phone", `book=${C}`, { phone: true }],
    ["19-egypt-q1-dark", `book=${E}&theme=dark`],
  ],
  "confirm-facts": [
    ["01-el-viaje-flagged", `book=${V}`],
    ["02-el-viaje-answered-story", `book=${V}&answer=genre:story`],
    ["03-el-viaje-create", `book=${V}&answer=genre:story&create=1`, { full: false }],
    ["04-hyena-all-agree", `book=${H}`],
    ["05-my-school-spreads", `book=${C}&open=composition`],
    ["06-praticas-quiet-disagreement", `book=${T}&open=diagrams`],
    ["07-el-viaje-phone", `book=${V}`, { phone: true }],
    ["08-el-viaje-dark", `book=${V}&theme=dark&answer=genre:story`],
  ],
  "teaching-chat": [
    ["01-el-viaje-first-question", `book=${V}&noscroll`],
    ["02-el-viaje-not-sure", `book=${V}&answers=pageGrouping:single&noscroll`],
    ["03-el-viaje-done", `book=${V}&answers=pageGrouping:single,genre:story,composition:text-mostly&noscroll`],
    ["04-my-school-spreads", `book=${C}&noscroll`],
    ["05-my-school-words-on-art", `book=${C}&answers=pageGrouping:spread,genre:story&noscroll`],
    ["06-praticas-done", `book=${T}&answers=pageGrouping:single,genre:textbook,exercises:many,diagrams:some&noscroll`],
    ["07-el-viaje-phone", `book=${V}&answers=pageGrouping:single&noscroll`, { phone: true }],
    ["08-dark", `book=${C}&answers=pageGrouping:spread&noscroll&theme=dark`],
  ],
  "describe-first": [
    ["01-el-viaje-ask", `book=${V}`],
    ["02-el-viaje-said-story", `book=${V}&kind=story`],
    ["03-el-viaje-unsure", `book=${V}&kind=unsure`],
    ["04-hyena-said-story", `book=${H}&kind=story`],
    ["05-praticas-said-textbook", `book=${T}&kind=textbook`],
    ["06-el-viaje-phone", `book=${V}&kind=story`, { phone: true }],
    ["07-dark", `book=${V}&theme=dark`],
  ],
}

const browser = await chromium.launch()
const only = process.argv[2]
for (const [dir, list] of Object.entries(shots)) {
  if (only && dir !== only) continue
  mkdirSync(join(P, dir, "shots"), { recursive: true })
  for (const [name, q, o = {}] of list) {
    const page = await browser.newPage({ viewport: o.phone ? { width: 390, height: 844 } : { width: 1280, height: 860 }, deviceScaleFactor: 1 })
    const errs = []
    page.on("pageerror", (e) => errs.push(e.message))
    await page.goto(pathToFileURL(join(P, dir, "index.html")).href + "?" + q)
    if ((dir === "check-then-ask" || dir.startsWith("r3-")) && o.full !== false) await page.addStyleTag({ content: ".dock{position:static!important}" })
    await page.waitForTimeout(700)
    await page.screenshot({ path: join(P, dir, "shots", name + ".png"), fullPage: o.full !== false, type: "png" })
    console.log(dir, name, errs.length ? "ERR " + errs.join("; ") : "ok")
    await page.close()
  }
}
await browser.close()
