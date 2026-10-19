import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'

// Exercise the public resize controls with the actual Inspector mounted. The
// canvas DOM's classList hides duplicates, so also check the editor model.
const origin = process.env.STUDIO_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
const errors = [], duplicateKeys = [], writes = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => {
  if (message.text().includes('same key')) duplicateKeys.push(message.text())
})
page.on('request', request => {
  if (request.url().includes('/api/books/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url())
})
const button = name => page.getByRole('button', { name, exact: true })
const tick = () => page.waitForTimeout(180)
let passed = 0
async function check(name, run) {
  await run()
  console.log('PASS', name)
  passed++
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
    function Capture() {
      window.fixtureEditor = useEditor()
      window.fixtureDoc = useDocument()
      return null
    }
    document.querySelector('#root').remove()
    const host = document.createElement('div')
    document.body.append(host)
    const h = React.createElement
    function App() {
      const [html, setHtml] = React.useState('<div id="banner" class="w-full bg-emerald-700 hover:bg-emerald-800"><div id="inner" class="px-8 py-12"><h1 class="text-3xl">Water in the Atmosphere</h1></div></div>')
      return h(I18nProvider, { i18n }, h(HtmlEditor, { value: html, onChange: setHtml, layout: 'flow', className: 'flex h-dvh' },
        h(Capture),
        h(HtmlEditor.Canvas, { className: 'flex-1 min-w-0' }, h(HtmlEditor.Canvas.Toolbar, null, h(HtmlEditor.History)), h(ResponsiveCanvas)),
        h('div', { className: 'flex w-80 shrink-0' }, h(StylesPanel, { editable: true }))))
    }
    createRoot(host).render(h(App))
  })
  await page.locator('#banner').waitFor()
  await page.evaluate(() => window.fixtureEditor.select(document.querySelector('#banner').dataset.adtId))
  await tick()
  await button('Edit Tailwind classes').click()
  const html = () => page.evaluate(() => window.fixtureEditor.getHtml())
  const classes = selector => page.evaluate(selector => window.fixtureDoc.nodes[document.querySelector(selector).dataset.adtId].classes, selector)
  async function uniqueFrames() {
    for (const selector of ['#banner', '#inner']) {
      const values = await classes(selector)
      assert.equal(values.filter(value => value === 'box-border').length, 1, `${selector}: ${values.join(' ')}`)
      assert.equal(values.length, new Set(values).size, `${selector} has duplicate classes`)
      assert.ok(!values.includes('box-content'), `${selector} has conflicting box sizing`)
    }
    assert.equal(await button('Remove box-border').count(), 1)
  }
  async function dragHeight(delta) {
    const handle = await button('Drag to change height').boundingBox()
    assert.ok(handle)
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + delta, { steps: 8 })
    await page.mouse.up()
    await tick()
  }
  async function history(action, expected) {
    await button(action).click()
    await tick()
    assert.equal(await html(), expected)
  }
  await check('repeated banner height drags keep every wrapper class unique and remain individually undoable', async () => {
    for (const delta of [-20, 30, -10, 20]) {
      const before = await html()
      await dragHeight(delta)
      const after = await html()
      assert.notEqual(after, before)
      await uniqueFrames()
      await history('Undo', before)
      await history('Redo', after)
      await uniqueFrames()
    }
    assert.ok((await classes('#banner')).includes('bg-emerald-700'))
    assert.ok((await classes('#inner')).includes('px-8'))
  })
  await check('numeric height changes also keep a single removable class without a reload', async () => {
    await page.evaluate(() => {
      const id = document.querySelector('#banner').dataset.adtId
      window.fixtureEditor.setClasses(id, [...window.fixtureDoc.nodes[id].classes, 'box-content'])
    })
    await tick()
    for (const height of ['220', '250', '200']) {
      await button('Size and spacing').click()
      const input = page.getByRole('spinbutton', { name: 'Height', exact: true })
      await input.fill(height)
      await input.press('Enter')
      await page.keyboard.press('Escape')
      await tick()
      await uniqueFrames()
    }
    const before = await html()
    await button('Remove box-border').click()
    await tick()
    const after = await html()
    assert.ok(!(await classes('#banner')).includes('box-border'))
    assert.equal(await button('Remove box-border').count(), 0)
    await history('Undo', before)
    assert.equal(await button('Remove box-border').count(), 1)
    await history('Redo', after)
    assert.equal(await button('Remove box-border').count(), 0)
    await dragHeight(12)
    await uniqueFrames()
    assert.deepEqual(duplicateKeys, [])
  })
  await check('a resize repairs existing duplicate classes and leaves the sidebar removable', async () => {
    await page.evaluate(() => {
      const id = document.querySelector('#banner').dataset.adtId
      const classes = window.fixtureDoc.nodes[id].classes
      window.fixtureEditor.transaction(() => window.fixtureEditor.setClasses(id, [...classes, 'box-border', 'bg-emerald-700', 'box-border']))
    })
    await tick()
    const before = await html()
    await dragHeight(10)
    await uniqueFrames()
    assert.ok((await classes('#banner')).includes('hover:bg-emerald-800'))
    const after = await html()
    await history('Undo', before)
    await history('Redo', after)
    await uniqueFrames()
    await button('Remove box-border').click()
    await tick()
    assert.ok(!(await classes('#banner')).includes('box-border'))
    assert.equal(await button('Remove box-border').count(), 0)
  })
  await check('previously stored duplicate classes can be deleted directly, undone and redone', async () => {
    await page.evaluate(() => {
      const id = document.querySelector('#banner').dataset.adtId
      window.fixtureEditor.transaction(() => window.fixtureEditor.setClasses(id, [...window.fixtureDoc.nodes[id].classes, 'box-border', 'box-border', 'box-border']))
    })
    await tick()
    const before = await html()
    await button('Remove box-border').first().click()
    await tick()
    const after = await html()
    assert.ok(!(await classes('#banner')).includes('box-border'))
    assert.equal(await button('Remove box-border').count(), 0)
    await history('Undo', before)
    assert.equal(await button('Remove box-border').count(), 3)
    await history('Redo', after)
    assert.equal(await button('Remove box-border').count(), 0)
  })
  assert.deepEqual(errors, [])
  assert.deepEqual(writes, [])
  console.log(`${passed} class-update checks passed; no book writes`)
} finally {
  await browser.close()
}
