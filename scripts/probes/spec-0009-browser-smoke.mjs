import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const base = 'http://127.0.0.1:41790', output = process.argv[2]
assert.ok(output, 'Supply screenshot directory')
fs.mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => localStorage.setItem('adt-studio-openai-key', 'stub-only'))
  await page.goto(base + '/books/momograde1/validation?tab=reviewer-validation', { waitUntil: 'domcontentloaded' })
  const originalAssessment = await (await page.request.get(base + '/api/books/momograde1/debug/accessibility')).json()
  const reviewUrl = base + '/api/books/momograde1/validation/page-results?sessionId=phase-b-acceptance'
  const originalReview = await (await page.request.get(reviewUrl)).json()
  await page.getByRole('button', { name: 'Rerender section pg005_sec001', exact: true }).click()
  await page.getByRole('alertdialog').waitFor()
  await page.getByText(/Provider calls may cost money/).waitFor()
  await page.screenshot({ path: output + '/confirmation.png', animations: 'disabled' })
  let dropped = false
  await page.route('**/pages/pg005/render-tasks', async route => {
    if (!dropped && route.request().method() === 'POST') { dropped = true; await route.fetch(); await route.abort() }
    else await route.continue()
  })
  await page.getByRole('button', { name: 'Confirm rerender', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Running' }).waitFor()
  await page.screenshot({ path: output + '/running-lost-response.png' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('status').filter({ hasText: 'Running' }).waitFor()
  await page.request.post(base + '/__fixture/release')
  await page.getByRole('status').filter({ hasText: 'Completed' }).waitFor({ timeout: 60000 })
  await page.getByText('The finding is unchanged.', { exact: false }).waitFor()
  await page.screenshot({ path: output + '/completed.png' })
  await page.getByRole('button', { name: 'Open task output in Storyboard', exact: true }).click()
  await page.waitForURL(url => url.pathname.includes('/storyboard/'), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Return to Validation', exact: true }).waitFor()
  await page.screenshot({ path: output + '/storyboard.png' })
  await page.getByRole('button', { name: 'Return to Validation', exact: true }).click()
  await page.waitForURL('**/validation*')
  await page.getByRole('button', { name: 'Refresh validation', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh validation', exact: true }).waitFor({ state: 'visible' })
  await page.waitForFunction(async version => {
    const response = await fetch('/api/books/momograde1/debug/accessibility')
    return (await response.json()).version > version
  }, originalAssessment.version, { timeout: 60000 })
  assert.deepEqual(await (await page.request.get(reviewUrl)).json(), originalReview)
  const historical = await (await page.request.get(base + '/api/books/momograde1/debug/accessibility?assessment=' + encodeURIComponent(originalAssessment.assessment.generatedAt))).json()
  assert.deepEqual(historical, originalAssessment)
  await page.screenshot({ path: output + '/return-validation.png' })
  const state = await (await page.request.get(base + '/__fixture/state')).json()
  assert.equal(state.calls, 2)
  assert.deepEqual(errors, [])
  const report = { confirmation: true, droppedReplyRecovered: dropped, reloadRetainsTask: true, completedWithoutPassing: true, editorReturnContext: true, explicitNewAssessment: true, historicalAssessmentUnchanged: true, humanReviewUnchanged: true, providerRequests: state.calls, errors }
  fs.writeFileSync(output + '/report.json', JSON.stringify(report, null, 2))
  console.log('PASS', JSON.stringify(report))
} catch (error) {
  for (const page of browser.contexts().flatMap(c => c.pages())) { console.log(await page.locator('body').innerText()); await page.screenshot({ path: output + '/failure.png' }) }
  throw error
} finally { await browser.close() }
