import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'

// In-memory fixtures only. Keep going after a failure so an audit reports every
// reproduction, but exit unsuccessfully if any regression remains.
const origin = process.env.STUDIO_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
const errors = [], writes = [], failures = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (request.url().includes('/api/books/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url())
})
const button = name => page.getByRole('button', { name, exact: true })
const tick = () => page.waitForTimeout(150)
let passed = 0
async function check(name, run) {
  try { await run(); passed++; console.log('PASS', name) }
  catch (error) { failures.push(name); console.log('FAIL', name, error.message) }
}

try {
  await page.goto(`${origin}/responsive-playground.html`)
  await page.locator('#demo-image').waitFor()
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name)
    const module = name => resources.find(url => new URL(url).pathname.endsWith(`/deps/${name}.js`))
    const React = (await import(module('react'))).default
    const reactDom = await import(module('react-dom_client'))
    const { createRoot } = reactDom.default ?? reactDom
    const { HtmlEditor } = await import(module('adt-html-editor_shadcn'))
    const { useEditor, useDocument } = await import(module('adt-html-editor'))
    const { I18nProvider } = await import(module('@lingui_react'))
    const { i18n } = await import(module('@lingui_core'))
    const { ResponsiveCanvas } = await import('/src/components/app/screens/pipeline/editor/responsive/ResponsiveCanvas.tsx')
    const { StylesPanel } = await import('/src/components/app/screens/pipeline/panel/StylesPanel.tsx')
    function Capture() { window.fixtureEditor = useEditor(); window.fixtureDoc = useDocument(); return null }
    document.querySelector('#root').remove()
    const host = document.createElement('div'); document.body.append(host)
    const h = React.createElement
    function App() {
      const [html, setHtml] = React.useState('<p>Fixture</p>')
      return h(I18nProvider, { i18n }, h(HtmlEditor, { value: html, onChange: setHtml, layout: 'flow', className: 'flex h-dvh' },
        h(Capture), h(HtmlEditor.Canvas, { className: 'flex-1 min-w-0' }, h(HtmlEditor.Canvas.Toolbar, null, h(HtmlEditor.History)), h(ResponsiveCanvas)),
        h('div', { className: 'flex w-80 shrink-0' }, h(StylesPanel, { editable: true }))))
    }
    createRoot(host).render(h(App))
  })
  await page.locator('.adt-canvas p').waitFor()
  const html = () => page.evaluate(() => window.fixtureEditor.getHtml())
  const fixture = '<article style="padding:96px 32px"><div id="box" style="width:60%;min-height:160px;margin-bottom:20px;background:#ddd"><p>Content</p></div><p id="next">Following content</p></article>'
  async function reset(value = fixture) {
    await page.mouse.up()
    await page.keyboard.press('Escape')
    await page.evaluate(value => { document.documentElement.style.removeProperty('font-size'); window.fixtureEditor.replaceDocument(value) }, value)
    await tick()
  }
  async function select(selector) {
    await page.evaluate(selector => window.fixtureEditor.select(document.querySelector(selector).dataset.adtId), selector)
    await tick()
  }
  async function beginDrag(handle, dx, dy) {
    const box = await handle.boundingBox(); assert.ok(box)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 })
    await tick()
  }
  for (const layout of ['flex;flex-direction:column', 'grid;grid-template-columns:1fr']) {
    await check(`short items in ${layout} reorder vertically at the bottom-left drop edge`, async () => {
      await reset(`<article style="padding:96px 32px"><div id="stack" style="display:${layout}"><p id="first" style="line-height:24px;margin:0">First</p><p id="second" style="line-height:24px;margin:0">Second</p></div></article>`)
      await select('#first')
      const before = await html()
      await button('Drag to reposition component').click()
      const source = await page.locator('#first').boundingBox(), target = await page.locator('#second').boundingBox()
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
      await page.mouse.down()
      await page.mouse.move(target.x + target.width * .3, target.y + target.height * .9, { steps: 8 })
      await page.mouse.up(); await tick()
      assert.equal(await page.locator('#stack > :last-child').getAttribute('id'), 'first')
      await button('Undo').click(); await tick(); assert.equal(await html(), before)
    })
  }
  for (const direction of ['ltr', 'rtl']) {
    for (const layout of ['flex', 'grid;grid-template-columns:1fr 1fr']) {
      await check(`${direction} ${layout} drops and its preview follow the row's reading direction`, async () => {
        await reset(`<article style="padding:96px 32px"><div id="row" dir="${direction}" style="display:${layout};gap:20px"><div id="first" style="width:240px;height:100px">First</div><div id="second" style="width:240px;height:100px">Second</div></div></article>`)
        await select('#first'); const before = await html()
        await button('Drag to reposition component').click()
        const source = await page.locator('#first').boundingBox(), target = await page.locator('#second').boundingBox()
        await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down()
        await page.mouse.move(target.x + target.width * (direction === 'rtl' ? .1 : .9), target.y + target.height / 2, { steps: 8 })
        await tick()
        const indicator = await page.locator('[data-arrange-target]').boundingBox(); assert.ok(indicator)
        assert.ok(Math.abs(indicator.x - (direction === 'rtl' ? target.x : target.x + target.width)) < 1)
        await page.mouse.up(); await tick()
        assert.equal(await page.locator('#row > :last-child').getAttribute('id'), 'first')
        await button('Undo').click(); await tick(); assert.equal(await html(), before)
      })
    }
  }
  await check('spacing drag reports and applies the same pixels with a 20px root font', async () => {
    await reset()
    await page.evaluate(() => { document.documentElement.style.fontSize = '20px' })
    await select('#box')
    const before = await html()
    await beginDrag(button('Drag to change space below'), 0, 20)
    await page.mouse.up(); await tick()
    assert.equal(await page.locator('#box').evaluate(element => getComputedStyle(element).marginBottom), '40px')
    await button('Undo').click(); await tick(); assert.equal(await html(), before)
  })
  for (const gesture of ['width', 'height', 'arrange']) {
    await check(`locking during ${gesture} cancels the gesture without committing stale changes`, async () => {
      await reset(); await select('#box')
      const before = await html(), beforeStyle = await page.locator('#box').getAttribute('style')
      if (gesture === 'arrange') {
        await button('Drag to reposition component').click()
        const source = await page.locator('#box').boundingBox(), target = await page.locator('#next').boundingBox()
        await beginDrag(page.locator('#box'), 0, target.y + target.height * .95 - source.y - source.height / 2)
      } else await beginDrag(button(gesture === 'width' ? 'Drag to resize width' : 'Drag to change height').last(), gesture === 'width' ? 60 : 0, gesture === 'height' ? 40 : 0)
      await page.evaluate(() => window.fixtureEditor.setLocked(document.querySelector('#box').dataset.adtId, true))
      await tick(); await page.mouse.up(); await tick()
      assert.equal(await html(), before)
      assert.equal(await page.locator('#box').getAttribute('style'), beforeStyle)
      assert.equal(await button('Undo').isDisabled(), true)
      assert.equal(await page.locator('[data-arrange-ghost]').count(), 0)
    })
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(writes, [])
  console.log(`${passed} edge-case checks passed; ${failures.length} failed; no book writes`)
  assert.deepEqual(failures, [])
} finally { await browser.close() }
