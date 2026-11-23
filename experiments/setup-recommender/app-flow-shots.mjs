// Drives the real Studio Add Book auto mode (Flow A) end to end and saves screenshots.
//   node app-flow-shots.mjs <studio-url> <pdf> <out-dir> [--create] [--phone]
// Needs the API and Studio dev servers running and a provider key on the server.
import { chromium } from "../../node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs"
import { mkdirSync } from "node:fs"
import { basename, join } from "node:path"

const [base, pdf, out, ...flags] = process.argv.slice(2)
const create = flags.includes("--create")
const phone = flags.includes("--phone")
const name = basename(pdf, ".pdf")
mkdirSync(out, { recursive: true })
const shot = (page, n) => page.screenshot({ path: join(out, `${name}${phone ? "-phone" : ""}-${n}.png`), fullPage: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 2600 } })
page.on("pageerror", (e) => console.error("pageerror:", e.message))
await page.goto(`${base}/books/new`)
await page.locator('input[type="file"]').setInputFiles(pdf)
await page.getByRole("button", { name: /^Continue/ }).click({ timeout: 30000 })
await page.getByText("Let the AI pick the settings").click()
const t0 = Date.now()
await page.getByText("Reading your book").waitFor({ timeout: 10000 })
await shot(page, "1-reading")
await page.getByText("Your book, as we read it").waitFor({ timeout: 120000 })
console.log(`${name}: review shown after ${((Date.now() - t0) / 1000).toFixed(1)} s`)
await page.waitForTimeout(1500) // page pictures
await shot(page, "2-review")

const questions = page.locator("fieldset")
const n = await questions.count()
for (let i = 0; i < n; i++) await questions.nth(i).locator('input[type="radio"]').first().check()
if (n > 0) await shot(page, "3-answered")

await page.locator("details").first().locator("summary").click()
await page.waitForTimeout(500)
await shot(page, "4-pick-open")

if (create) {
  await page.getByRole("button", { name: "Create book" }).click()
  await page.waitForURL(/\/books\/[^/]+\/book/, { timeout: 60000 })
  console.log(`${name}: created, now at ${page.url()}`)
}
await browser.close()
