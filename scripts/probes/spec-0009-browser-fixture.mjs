// Loopback-only browser acceptance over disposable representative books.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Hono } from '../../apps/api/node_modules/hono/dist/index.js'
import { serve } from '../../apps/api/node_modules/@hono/node-server/dist/index.mjs'
import { serveStatic } from '../../apps/api/node_modules/@hono/node-server/dist/serve-static.mjs'
import { copyBooks } from './spec-0012-packaged-common.mjs'
import { createBookStorage } from '../../packages/storage/dist/index.js'
import { readValidationArtifact } from '../../packages/pipeline/dist/index.js'
import { saveReviewerPageValidationRecord } from '../../apps/api/dist/services/reviewer-validation-service.js'
const [source, out] = process.argv.slice(2)
assert.ok(source && out && !fs.existsSync(out), 'Supply source books and new evidence directory')
fs.mkdirSync(out, { recursive: true })
const root = path.resolve(import.meta.dirname, '../..'), books = path.resolve(out, 'books')
copyBooks(source, books)
process.env.PROJECT_ROOT = root
process.env.BOOKS_DIR = books
process.env.CONFIG_PATH = path.resolve(out, 'global.yaml')
fs.writeFileSync(process.env.CONFIG_PATH, 'structure_types: {}\nrole_types:\n  text: Text\nreviewer_validation:\n  enabled: true\n')
const storage = createBookStorage('momograde1', books)
const artifact = readValidationArtifact(path.join(books, 'momograde1/adt'))
const record = storage.getLatestNodeData('reviewer-page-validation', 'phase-b-acceptance:pg005:default').data
const rendering = storage.getLatestNodeData('web-rendering', 'pg005').data.sections.find(s => s.html.includes('data-section-id="pg005_sec001"'))
storage.close()
saveReviewerPageValidationRecord('momograde1', books, { ...record, artifact_id: artifact.id })
let html = rendering.html
const ids = new Map([...html.matchAll(/data-id="([^\"]+_activity_[a-f0-9]{24})"/g)].map((m, i) => [m[1], `activity_gen_${i}`]))
for (const [id, replacement] of ids) html = html.replaceAll(id, replacement)
const answers = Object.entries(rendering.activityAnswers ?? {}).map(([id, value]) => ({ id: ids.get(id) ?? id, value }))
let release, calls = 0
const gate = new Promise(resolve => { release = resolve })
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://api.openai.com/v1/chat/completions', 'No live provider requests')
  calls++
  const body = JSON.parse(init.body), isAnswers = /correct answers|correct answer|answer key/i.test(JSON.stringify(body.messages))
  await gate
  return Response.json({ id: `stub-${calls}`, object: 'chat.completion', created: 0, model: body.model,
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(isAnswers ? { reasoning: 'Fixture', answers } : { reasoning: 'Fixture', content: html }) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
}
const { default: normalApp } = await import('../../apps/api/dist/app.js')
const app = new Hono()
app.post('/__fixture/release', c => { release(); return c.json({ calls }) })
app.get('/__fixture/state', c => c.json({ calls }))
app.all('/api/*', c => normalApp.fetch(c.req.raw))
app.use('*', serveStatic({ root: root + '/apps/studio/dist' }))
app.get('*', serveStatic({ path: root + '/apps/studio/dist/index.html' }))
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 41790 }, () => console.log('Fixture ready on 41790'))
