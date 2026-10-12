// Disposable loopback-only acceptance server; never point at production books.
import path from 'node:path'
import { Hono } from '../../apps/api/node_modules/hono/dist/index.js'
import { serve } from '../../apps/api/node_modules/@hono/node-server/dist/index.mjs'
import { serveStatic } from '../../apps/api/node_modules/@hono/node-server/dist/serve-static.mjs'
import { createBookEventBus } from '../../apps/api/src/services/book-event-bus.ts'
import { createPageErrorDecisions } from '../../apps/api/src/services/page-error-decisions.ts'
import { createStageService } from '../../apps/api/src/services/stage-service.ts'
import { createStageRoutes } from '../../apps/api/src/routes/stages.ts'
const root = path.resolve(import.meta.dirname, '../..')
process.env.PROJECT_ROOT = root
process.env.BOOKS_DIR = process.argv[2]
if (!process.env.BOOKS_DIR) throw new Error('Supply disposable books directory')
const { default: normalApp } = await import('../../apps/api/src/app.ts')
const bus = createBookEventBus()
const broker = createPageErrorDecisions(bus)
const service = createStageService({ async run() { throw new Error('Fixture does not run providers') } }, bus, broker)
const app = new Hono()
app.post('/__fixture/decision', (c) => {
  broker.clearForRun('momograde1', 'stop', 'fixture-run')
  broker.beginRun('momograde1', 'fixture-run')
  void broker.requestDecision({ label: 'momograde1', runId: 'fixture-run', canRetry: c.req.query('unsupported') !== '1', validateRetry() {}, step: c.req.query('unsupported') === '1' ? 'image-captioning' : 'image-meaningfulness', pageId: 'pg002', error: 'Provider connection closed (3 attempts)', errorClass: 'connection-closed', attemptCount: 3 })
  return c.json({ ok: true })
})
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && !c.req.path.endsWith('/stages/decision')) return c.json({ error: 'Acceptance fixture is read-only' }, 403)
  return next()
})
app.route('/api', createStageRoutes(service, bus, broker, process.env.BOOKS_DIR, root+'/prompts', root+'/assets/adt', root+'/config.yaml'))
app.all('/api/*', (c) => normalApp.fetch(c.req.raw))
app.use('*', serveStatic({ root: root+'/apps/studio/dist' }))
app.get('*', serveStatic({ path: root+'/apps/studio/dist/index.html' }))
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 41789 }, () => console.log('Fixture ready on 41789'))
