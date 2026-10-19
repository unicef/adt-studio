import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'

// In-memory fixtures and a read-only copy of page 15. Never save to the book.
const origin = process.env.STUDIO_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ headless: true })
// With the mounted Styles panel, this reproduces the 794px workspace canvas.
const page = await browser.newPage({ viewport: { width: 1146, height: 1000 } })
const errors = [], writes = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (request.url().includes('/api/books/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url())
})
const button = name => page.getByRole('button', { name, exact: true })
const tick = () => page.waitForTimeout(150)
let passed = 0
async function check(name, run) {
  await run(); passed++; console.log('PASS', name)
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
    const { useEditor, useDocument, useWidthPresets } = await import(module('adt-html-editor'))
    const { I18nProvider } = await import(module('@lingui_react'))
    const { i18n } = await import(module('@lingui_core'))
    const { ResponsiveCanvas } = await import('/src/components/app/screens/pipeline/editor/responsive/ResponsiveCanvas.tsx')
    const { StylesPanel } = await import('/src/components/app/screens/pipeline/panel/StylesPanel.tsx')
    function Capture() { window.fixtureEditor = useEditor(); window.fixtureDoc = useDocument(); window.fixtureWidth = useWidthPresets([{id:'desktop',label:'Desktop',width:0},{id:'mobile',label:'Mobile',width:390}]); return null }
    document.querySelector('#root').remove()
    const host = document.createElement('div'); document.body.append(host)
    const h = React.createElement
    function App() {
      const [html, setHtml] = React.useState('<p>Fixture</p>')
      return h(I18nProvider, { i18n }, h(HtmlEditor, { value: html, onChange: setHtml, layout: 'flow', className: 'flex h-dvh' },
        h(HtmlEditor.Canvas, { className: 'flex-1 min-w-0' }, h(Capture), h(HtmlEditor.Canvas.Toolbar, null, h(HtmlEditor.History)), h(ResponsiveCanvas)),
        h('div', { className: 'flex w-80 shrink-0' }, h(StylesPanel, { editable: true }))))
    }
    createRoot(host).render(h(App))
  })
  await page.locator('.adt-canvas p').waitFor()
  const html = () => page.evaluate(() => window.fixtureEditor.getHtml())

  async function reset(value) { await page.evaluate(value => window.fixtureEditor.replaceDocument(value), value); await tick() }
  async function select(selector) { await page.evaluate(selector => window.fixtureEditor.select(document.querySelector(selector).dataset.adtId), selector); await tick() }
  async function action(name) { await button('Component layout').click(); await button(name).last().click(); await tick() }
  const footerWrap = () => button('Wrap in container').first()
  async function wrap() {
    await footerWrap().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Wrap in container', exact: true }).click()
    await tick()
  }
  async function history(action, expected) {
    await button(action).click(); await tick(); assert.equal(await html(), expected)
  }
  const dimensions = selector => page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect(), css = getComputedStyle(el)
    return { x: r.x, y: r.y, width: r.width, height: r.height, color: css.color, fontSize: css.fontSize, border: css.border, radius: css.borderRadius }
  })
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 2, `${actual} != ${expected}`)
  const bookUrl = `${origin}/api/books/C-98-Weather-and-Climate---textbook/pages/pg015`
  const book = await (await page.request.get(bookUrl)).json()
  const original = book.rendering.sections[0].html
  const badge = '[data-id="pg015_n0004"]:not(img)'
  // Select the decorated parent, as the user does via Select parent.
  await reset(original)
  await select(badge)
  await button('Select parent').first().click(); await tick()
  const badgeId = await page.locator(badge).evaluate(el => el.parentElement.dataset.adtId)
  const box = `[data-adt-id="${badgeId}"]`
  const beforeWrap = await html(), beforeBox = await dimensions(box), beforeLabel = await dimensions(badge)
  const title = '[data-id="pg015_n0002"]'
  const beforeTitle = await dimensions(title)
  let wrapped
  await check('page 15 Chapter 3 offers wrapping and gains resize handles without changing decoration or its neighbour', async () => {
    assert.equal(await button('Drag to resize width').count(), 0)
    await action('Wrap in container')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await html(), beforeWrap)
    await wrap()
    wrapped = await html()
    await button('Drag to resize width').first().waitFor({ state: 'visible' })
    assert.equal(await button('Drag to resize width').count(), 4)
    const after = await dimensions(box), afterTitle = await dimensions(title)
    for (const key of ['x', 'y', 'width', 'height']) {
      close(after[key], beforeBox[key]); close(afterTitle[key], beforeTitle[key])
    }
    for (const key of ['color', 'border', 'radius']) assert.equal(after[key], beforeBox[key])
    assert.equal((await dimensions(badge)).fontSize, beforeLabel.fontSize)
    assert.match(wrapped, /data-responsive-container="true"/)
    assert.doesNotMatch(wrapped, /data-adt-id|data-responsive-selection/)
    assert.equal(await footerWrap().count(), 0, 'do not offer repeated nested wrapping')
    await history('Undo', beforeWrap); await history('Redo', wrapped)
  })
  await check('badge width can grow and shrink within the row; gestures are individually undoable', async () => {
    await button('Increase width').click(); await tick()
    assert.ok((await dimensions(box)).width > beforeBox.width + 20)
    const enlarged = await html()
    await history('Undo', wrapped); await history('Redo', enlarged)
    const handle = await button('Drag to resize width').nth(2).boundingBox()
    const before = (await dimensions(box)).width
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + 24, handle.y + handle.height / 2, { steps: 8 })
    await page.mouse.up(); await tick()
    assert.ok((await dimensions(box)).width < before - 15)
    await history('Undo', enlarged)
    await history('Undo', wrapped)
  })
  await check('badge height handle works after wrapping and preserves its label', async () => {
    const handle = await button('Drag to change height').boundingBox()
    const before = (await dimensions(box)).height
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 32, { steps: 8 })
    await page.mouse.up(); await tick()
    assert.ok((await dimensions(box)).height > before + 25)
    assert.equal(await page.locator(badge).innerText(), 'Chapter 3')
    await history('Undo', wrapped)
    await button('Increase width').click(); await tick()
    await button('Increase width').click(); await tick()
    await page.screenshot({ path: '.context/responsive-chapter3-container.png', animations: 'disabled', clip: { x: 0, y: 0, width: 1146, height: 400 } })
    await button('Undo').click(); await tick(); await history('Undo', wrapped)
  })
  await check('wrapping retains the authored phone width and stacks the row without horizontal overflow', async () => {
    await page.evaluate(() => window.fixtureWidth.select('mobile')); await tick()
    const phone = await page.locator(badge).evaluate(el => {
      const box = el.parentElement, slot = box.parentElement, row = slot.parentElement, canvas = el.closest('.adt-canvas')
      return { width: box.getBoundingClientRect().width, slot: slot.clientWidth, row: getComputedStyle(row).flexDirection, scroll: canvas.scrollWidth, client: canvas.clientWidth }
    })
    close(phone.width, phone.slot)
    assert.equal(phone.row, 'column')
    assert.ok(phone.scroll <= phone.client + 1)
    await page.evaluate(() => window.fixtureWidth.select('desktop')); await tick()
    close((await dimensions(box)).width, beforeBox.width)
  })
  await check('the serialized container survives reload with handles available and unique classes', async () => {
    await reset(wrapped); await select(badge); await button('Select parent').first().click(); await tick()
    await button('Drag to resize width').first().waitFor({ state: 'visible' })
    assert.equal(await button('Drag to resize width').count(), 4)
    assert.equal(await footerWrap().count(), 0)
    assert.ok(await page.locator(badge).evaluate(el => {
      return [el.parentElement, el.parentElement.parentElement].every(element => {
        const classes = window.fixtureDoc.nodes[element.dataset.adtId].classes
        return new Set(classes).size === classes.length
      })
    }))
  })
  await check('a grid figure wraps as a unit and keeps its caption, image and column', async () => {
    await reset('<article style="padding:96px 24px"><div id="grid" class="grid grid-cols-2 gap-6"><figure id="figure" class="bg-amber-100"><img id="art" alt="Weather" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%2280%22/%3E"><figcaption>Original caption</figcaption></figure><p id="neighbour">The neighbouring column</p></div></article>')
    await select('#art'); assert.equal(await footerWrap().count(), 0, 'keep semantic figure intact')
    await button('Select parent').first().click(); await tick()
    const before = await html(), imageBefore = await page.locator('#art').getAttribute('src')
    const neighbour = await dimensions('#neighbour')
    await wrap(); await button('Decrease width').click(); await tick()
    assert.equal(await page.locator('#figure figcaption').innerText(), 'Original caption')
    assert.equal(await page.locator('#art').getAttribute('src'), imageBefore)
    close((await dimensions('#neighbour')).x, neighbour.x)
    assert.equal(await page.locator('#grid').evaluate(el => el.children.length), 2)
    await button('Undo').click(); await tick(); await history('Undo', before)
  })
  await check('ordinary blocks wrap without changing authored width, inheritance, content or IDs', async () => {
    await reset('<article style="padding:96px 24px;color:rgb(120,30,60);font-size:22px"><div id="card" style="width:65%;border:3px solid;padding:20px"><h2 id="heading">Keep this heading</h2><p>Keep this text</p></div><p>After</p></article>')
    await select('#card')
    const before = await html(), beforeDimensions = await dimensions('#card')
    await wrap()
    const after = await dimensions('#card')
    close(after.width, beforeDimensions.width)
    assert.equal(after.color, beforeDimensions.color); assert.equal(after.fontSize, beforeDimensions.fontSize)
    assert.equal(await page.locator('#card #heading').count(), 1)
    const wrapped = await html()
    await button('Move later').click(); await tick()
    assert.equal(await page.locator('#card').evaluate(el => el.parentElement.previousElementSibling.textContent), 'After')
    await history('Undo', wrapped)
    await history('Undo', before)
  })
  await check('RTL row wrapping keeps the badge on its original physical side', async () => {
    await reset('<article style="padding:96px 24px"><div dir="rtl" class="flex justify-between items-center gap-6"><p class="w-1/2">Title</p><div id="badge" class="w-32 rounded-full bg-emerald-100 p-4">Chapter 3</div></div></article>')
    await select('#badge'); const before = await dimensions('#badge')
    await wrap(); const after = await dimensions('#badge')
    close(after.x, before.x); close(after.width, before.width)
    await button('Increase width').click(); await tick()
    assert.ok((await dimensions('#badge')).width > before.width)
  })
  await check('unsafe structures and positioned diagrams do not offer wrapping', async () => {
    const cases = [
      '<p><span id="unsafe">Inline text</span></p>',
      '<ul><li id="unsafe">List item</li></ul>',
      '<table><tbody><tr><td id="unsafe">Cell</td></tr></tbody></table>',
      '<div style="transform:rotate(10deg)"><div id="unsafe">Rotated</div></div>',
      '<div class="flex flex-wrap"><div id="unsafe">Wrapped row</div></div>',
      '<div class="flex flex-row-reverse"><div id="unsafe">Reversed row</div></div>',
      '<div class="grid grid-cols-2"><div id="unsafe" class="col-span-2 col-start-1">Spanning</div></div>',
      '<div class="grid grid-cols-2"><div id="unsafe" style="grid-column-end:3">Explicit end line</div></div>',
      '<div id="unsafe" style="position:relative;width:200px;height:200px"><span style="position:absolute;left:100px">Diagram annotation</span></div>',
    ]
    for (const value of cases) {
      await reset(`<article style="padding:96px 24px">${value}</article>`); await select('#unsafe')
      assert.equal(await footerWrap().count(), 0, value)
    }
  })
  await check('locking a descendant while the dialog is open prevents wrapping', async () => {
    await reset('<article style="padding:96px 24px"><div class="flex"><div id="badge"><h2 id="label">Chapter 3</h2></div><p>Title</p></div></article>')
    await select('#badge'); const before = await html()
    await footerWrap().click()
    await page.evaluate(() => window.fixtureEditor.setLocked(document.querySelector('#label').dataset.adtId, true))
    await tick()
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Wrap in container', exact: true }).count(), 0)
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await html(), before)
  })
  const saved = await (await page.request.get(bookUrl)).json()
  assert.deepEqual(saved.versions, book.versions)
  assert.equal(saved.rendering.sections[0].html, original)
  assert.deepEqual(errors, []); assert.deepEqual(writes, [])
  console.log(`${passed} container checks passed; page 15 unchanged; no book writes`)
} finally { await browser.close() }
