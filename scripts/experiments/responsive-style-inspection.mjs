import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'

// Inspect actual controls without writing to a book or changing style semantics.
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
    const { StyleInspection } = await import(performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname.endsWith('/inspection/StyleInspection.tsx')))
    function Capture() { window.fixtureEditor = useEditor(); window.fixtureDoc = useDocument(); window.fixtureWidth = useWidthPresets([{id:'desktop',label:'Desktop',width:0},{id:'mobile',label:'Mobile',width:390}]); return null }
    window.fixtureImageUrl = document.querySelector('#demo-image').src
    document.querySelector('#root').remove()
    const host = document.createElement('div'); document.body.append(host)
    const h = React.createElement
    function App() {
      const [html, setHtml] = React.useState('<p>Fixture</p>')
      const [showStyles, setShowStyles] = React.useState(true)
      window.fixtureShowStyles = setShowStyles
      return h(I18nProvider, { i18n }, h(HtmlEditor, { value: html, onChange: setHtml, layout: 'flow', className: 'flex h-dvh' }, h(StyleInspection, null,
        h(HtmlEditor.Canvas, { className: 'flex-1 min-w-0' }, h(Capture), h(HtmlEditor.Canvas.Toolbar, null, h(HtmlEditor.History)), h(ResponsiveCanvas)),
        h('div', { className: 'flex w-80 shrink-0' }, showStyles && h(StylesPanel, { editable: true })))))
    }
    createRoot(host).render(h(App))
  })
  await page.locator('.adt-canvas p').waitFor()
  const html = () => page.evaluate(() => window.fixtureEditor.getHtml())

  async function reset(value) { await page.evaluate(value => window.fixtureEditor.replaceDocument(value), value); await tick() }
  async function select(selector) { await page.evaluate(selector => window.fixtureEditor.select(document.querySelector(selector).dataset.adtId), selector); await tick() }
  async function action(name) { await button('Component layout').click(); await button(name).last().click(); await tick() }
  const panel = page.locator('[data-applied-styles]')
  const tooltip = page.getByRole('tooltip', { name: 'Changing styles' })
  const recent = page.getByRole('region', { name: 'Latest style change' })
  const inline = panel.getByRole('region', { name: 'Inline CSS', exact: true })
  const rendered = async () => (await panel.locator('[data-rendered-value="width"]').innerText()).trim()
  const computed = () => panel.locator('[data-computed-property="width"]').innerText()
  const rounded = value => `${Math.round(parseFloat(value))}px`
  async function computedStyles(open) {
    if (await button('Computed CSS').getAttribute('aria-expanded') !== String(open)) await button('Computed CSS').click()
    await tick()
  }
  const width = () => page.locator('#box').evaluate(el => getComputedStyle(el).width)
  const fixture = '<article style="padding:96px 32px"><div id="box" class="w-[400px] h-[100px] bg-emerald-100">Example box</div><p id="after">Next paragraph</p></article>'
  async function dragStart(name, dx, dy) {
    const handle = await button(name).last().boundingBox()
    assert.ok(handle)
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + dx, handle.y + handle.height / 2 + dy, { steps: 8 })
    await tick()
  }
  async function history(action, value) { await button(action).click(); await tick(); assert.equal(await html(), value) }
  await reset(fixture); await select('#box')
  const baseline = await html()
  await check('the element header comes first; Inline CSS and Tailwind Classes start expanded', async () => {
    const inspector = page.getByRole('complementary', { name: 'Styles', exact: true })
    assert.match(await inspector.locator(':scope > div').first().innerText(), /div.*#box/s)
    const header = await inspector.locator(':scope > div').first().boundingBox(), content = await panel.boundingBox()
    assert.ok(header.y + header.height <= content.y)
    assert.equal(await button('Inline CSS').getAttribute('aria-expanded'), 'true')
    assert.equal(await button('Tailwind Classes').getAttribute('aria-expanded'), 'true')
    assert.equal(await button('Computed CSS').getAttribute('aria-expanded'), 'false')
    assert.equal(await page.getByRole('combobox', { name: 'Add class', exact: true }).count(), 0)
    assert.equal(await button('Remove w-[400px]').count(), 0)
    assert.equal(await button('Edit Tailwind classes').count(), 1)
    await button('Inline CSS').click()
    assert.equal(await inline.isVisible(), false)
    assert.equal(await button('Tailwind Classes').getAttribute('aria-expanded'), 'true')
    await button('Inline CSS').focus(); await page.keyboard.press('Enter')
    assert.equal(await inline.isVisible(), true)
    await button('Tailwind Classes').click()
    assert.equal(await panel.getByRole('region', { name: 'Tailwind Classes', exact: true }).isVisible(), false)
    await button('Tailwind Classes').click()
    assert.equal(await html(), baseline)
    assert.equal(await button('Undo').isDisabled(), true)
  })
  await check('Edit exposes add, reorder and delete controls; Done keeps the applied classes', async () => {
    const classes = () => page.evaluate(() => window.fixtureDoc.nodes[document.querySelector('#box').dataset.adtId].classes)
    await button('Tailwind Classes').click()
    await button('Edit Tailwind classes').click()
    assert.equal(await button('Tailwind Classes').getAttribute('aria-expanded'), 'true')
    const input = page.getByRole('combobox', { name: 'Add class', exact: true })
    await input.fill('rounded-lg'); await input.press('Enter'); await page.keyboard.press('Escape'); await tick()
    assert.ok((await classes()).includes('rounded-lg'))
    const added = await html(), originalIndex = (await classes()).indexOf('rounded-lg')
    // The existing class editor coalesces edits within 600ms. Keep these user
    // actions separate so their undo/redo checks exercise distinct history steps.
    await page.waitForTimeout(650)
    await button('Move rounded-lg up').click(); await tick()
    assert.equal((await classes()).indexOf('rounded-lg'), originalIndex - 1)
    const reordered = await html()
    await history('Undo', added); await history('Redo', reordered)
    await button('Remove rounded-lg').click(); await tick()
    assert.ok(!(await classes()).includes('rounded-lg'))
    const removed = await html()
    await button('Finish editing classes').click()
    assert.equal(await input.count(), 0)
    assert.equal(await html(), removed)
    assert.equal(await button('Inline CSS').getAttribute('aria-expanded'), 'true')
    assert.equal(await button('Tailwind Classes').getAttribute('aria-expanded'), 'true')
    await history('Undo', reordered)
    assert.match(await panel.getByRole('region', { name: 'Tailwind Classes', exact: true }).innerText(), /rounded-lg/)
    await reset(fixture); await select('#box')
  })
  await check('changing selection closes the class editor but preserves the accordion choices', async () => {
    await button('Edit Tailwind classes').click()
    await page.getByRole('combobox', { name: 'Add class', exact: true }).fill('uncommitted-class')
    await page.keyboard.press('Escape')
    await button('Inline CSS').click()
    await computedStyles(true)
    await select('#after')
    assert.equal(await page.getByRole('combobox', { name: 'Add class', exact: true }).count(), 0)
    assert.equal(await button('Inline CSS').getAttribute('aria-expanded'), 'false')
    assert.equal(await button('Tailwind Classes').getAttribute('aria-expanded'), 'true')
    assert.equal(await button('Computed CSS').getAttribute('aria-expanded'), 'true')
    assert.equal(await html(), baseline)
    await select('#box')
    assert.equal(await button('Inline CSS').getAttribute('aria-expanded'), 'false')
    await button('Inline CSS').click(); await computedStyles(false)
  })
  await check('all three choices survive deselection, groups, page replacement and closing the Styles panel', async () => {
    await button('Inline CSS').click(); await button('Tailwind Classes').click(); await computedStyles(true)
    async function remembered() {
      assert.equal(await button('Inline CSS').getAttribute('aria-expanded'), 'false')
      assert.equal(await button('Tailwind Classes').getAttribute('aria-expanded'), 'false')
      assert.equal(await button('Computed CSS').getAttribute('aria-expanded'), 'true')
      assert.equal(await page.getByRole('combobox', { name: 'Add class', exact: true }).count(), 0)
    }
    await select('#after'); await remembered()
    await page.evaluate(() => window.fixtureEditor.select(null)); await tick()
    assert.equal(await panel.count(), 0)
    await select('#box'); await remembered()
    await page.evaluate(() => window.fixtureEditor.selectMany(['box', 'after'].map(id => document.getElementById(id).dataset.adtId))); await tick()
    assert.equal(await panel.count(), 0)
    await select('#after'); await remembered()
    await reset('<article><p id="new-page" style="width:50%">A different page</p></article>'); await select('#new-page'); await remembered()
    assert.equal(await panel.locator('[data-computed-property="width"]').innerText(), await page.locator('#new-page').evaluate(el => getComputedStyle(el).width))
    await page.evaluate(() => window.fixtureShowStyles(false)); await tick()
    assert.equal(await panel.count(), 0)
    await page.evaluate(() => window.fixtureShowStyles(true)); await tick(); await remembered()
    assert.equal(await button('Undo').isDisabled(), true)
    await reset(fixture); await select('#box'); await remembered()
    assert.equal(await html(), baseline)
    await button('Inline CSS').click(); await button('Tailwind Classes').click(); await computedStyles(false)
  })
  await check('selection shows its inline CSS; expanded computed CSS excludes browser defaults', async () => {
    assert.equal((await inline.innerText()).replace(/\s+/g, ' ').trim(), 'None')
    assert.equal(await button('Computed CSS').getAttribute('aria-expanded'), 'false')
    await computedStyles(true)
    assert.equal(await computed(), '400px')
    assert.match(await panel.innerText(), /w-\[400px\]/)
    const properties = await panel.locator('[data-computed-property]').evaluateAll(nodes => nodes.map(el => el.dataset.computedProperty))
    assert.ok(properties.includes('height') && properties.includes('background-color'))
    for (const name of ['overflow-x', 'animation-duration', 'align-content', '--color-red-100', 'padding-top']) assert.ok(!properties.includes(name), name)
    assert.ok(properties.length < 20, properties.join(', '))
    await computedStyles(false)
    assert.equal(await html(), baseline)
    assert.equal(await button('Undo').isDisabled(), true)
  })
  await check('existing inline percentages show their computed pixels before any edit', async () => {
    await reset('<article style="padding:96px 32px"><div id="box" style="width:50%;height:100px;margin-left:5%">Existing styles</div></article>'); await select('#box')
    const before = await html()
    assert.match(await inline.innerText(), /50%/)
    assert.equal(await rendered(), rounded(await width()))
    const margin = await page.locator('#box').evaluate(el => getComputedStyle(el).marginLeft)
    assert.equal((await inline.locator('[data-rendered-value="margin-left"]').innerText()).trim(), rounded(margin))
    assert.equal(await recent.count(), 0)
    assert.equal(await html(), before)
  })
  let resized
  await check('dragging shows changing values only and commits inline CSS once', async () => {
    await reset(fixture); await select('#box')
    await dragStart('Drag to resize width', 70, 0)
    assert.equal(await html(), baseline, 'preview must not enter the document')
    assert.doesNotMatch(await tooltip.innerText(), /Inline CSS|div#box|400px|Live preview|Release to apply/)
    assert.match(await tooltip.innerText(), /width/)
    assert.equal(await rendered(), rounded(await width()))
    assert.equal((await tooltip.locator('[data-rendered-value="width"]').innerText()).trim(), rounded(await width()))
    assert.match(await inline.locator('[data-style-property="width"]').innerText(), /\d+%\s+\d+px/)
    assert.equal(await recent.count(), 0)
    assert.equal(await page.locator('input[aria-label="Width"]').inputValue(), '400', 'existing writer stays unchanged')
    await page.screenshot({ path: '.context/responsive-live-style-tooltip.png', animations: 'disabled' })
    await page.mouse.up(); await tick()
    assert.equal(await tooltip.count(), 0)
    assert.match(await inline.innerText(), /width/)
    resized = await html()
    assert.match(resized, /style="width: [0-9]+%;/)
  })
  await check('selecting another element immediately replaces the readout and leaves no recent change', async () => {
    const afterResize = await html()
    await computedStyles(true)
    await select('#after')
    assert.equal((await inline.innerText()).replace(/\s+/g, ' ').trim(), 'None')
    assert.equal(await panel.locator('[data-style-property="width"]').count(), 0)
    assert.equal(await button('Computed CSS').getAttribute('aria-expanded'), 'true')
    assert.equal(await recent.count(), 0)
    await page.evaluate(() => window.fixtureEditor.select(null)); await tick()
    assert.equal(await panel.count(), 0)
    await select('#box')
    assert.match(await inline.innerText(), /width/)
    assert.equal(await html(), afterResize)
  })
  await check('sidebar class edits show the selected inline override, including undo and redo', async () => {
    const actual = await width()
    const input = page.locator('input[aria-label="Width"]')
    await input.fill('260'); await input.press('Enter'); await input.blur(); await tick()
    assert.equal(await rendered(), rounded(actual))
    await computedStyles(true)
    assert.match(await panel.innerText(), /w-\[260px\]/)
    assert.equal(await computed(), actual)
    await history('Undo', resized); await history('Undo', baseline)
    assert.equal(await computed(), '400px')
    assert.equal((await inline.innerText()).replace(/\s+/g, ' ').trim(), 'None')
    await history('Redo', resized)
    assert.match(await inline.innerText(), /width/)
    await computedStyles(false)
  })
  for (const cancel of ['Escape', 'pointercancel', 'reset', 'lock', 'selection']) {
    await check(`${cancel} removes preview CSS and clears the tooltip without a commit`, async () => {
      await reset(fixture); await select('#box'); const before = await html()
      await dragStart('Drag to resize width', 48, 0)
      if (cancel === 'Escape') await page.keyboard.press('Escape')
      if (cancel === 'pointercancel') await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })))
      if (cancel === 'reset') { await reset(fixture); await select('#box') }
      if (cancel === 'lock') await page.evaluate(() => window.fixtureEditor.setLocked(document.querySelector('#box').dataset.adtId, true))
      if (cancel === 'selection') await select('#after')
      await tick(); await page.mouse.up(); await tick()
      assert.equal(await tooltip.count(), 0)
      assert.equal(await html(), before)
      assert.equal(await button('Undo').isDisabled(), true)
      assert.equal(await recent.count(), 0)
      assert.equal((await inline.innerText()).replace(/\s+/g, ' ').trim(), 'None')
    })
  }
  await check('nested height changes retain target labels only in the live tooltip', async () => {
    await reset('<article style="padding:96px 32px"><div id="banner" class="bg-emerald-700"><div id="inner" class="px-8 py-12"><h2>Chapter 3</h2></div></div></article>')
    await select('#banner'); const before = await html()
    await dragStart('Drag to change height', 0, -30)
    for (const value of ['div#banner', 'div#inner', 'min-height', 'padding-top']) assert.match(await tooltip.innerText(), new RegExp(value))
    assert.doesNotMatch(await tooltip.innerText(), /Tailwind|Preview uses|release writes/)
    assert.doesNotMatch(await inline.innerText(), /div#inner/)
    await page.mouse.up(); await tick()
    assert.equal(await tooltip.count(), 0)
    assert.equal(await recent.count(), 0)
    await computedStyles(true)
    assert.match(await panel.innerText(), /min-h-\[/)
    await select('#inner'); await computedStyles(true)
    assert.match(await panel.innerText(), /pt-\[/)
    assert.ok(parseFloat(await panel.locator('[data-computed-property="padding-top"]').innerText()) < 48)
    await history('Undo', before)
    await computedStyles(false)
  })
  await check('spacing appears as inline margin on the selected element', async () => {
    await reset(fixture); await select('#box'); const before = await html()
    await dragStart('Drag to change space below', 0, 24)
    assert.match(await tooltip.innerText(), /margin-bottom/)
    await page.mouse.up(); await tick()
    assert.match(await inline.innerText(), /margin-bottom/)
    assert.doesNotMatch(await inline.innerText(), /padding/)
    await history('Undo', before)
  })
  await check('reordering does not leave a change log or invent inline position CSS', async () => {
    await reset(fixture); await select('#box'); const before = await html()
    await button('Move later').click(); await tick()
    assert.equal(await recent.count(), 0)
    assert.equal((await inline.innerText()).replace(/\s+/g, ' ').trim(), 'None')
    assert.equal(await page.locator('#box').evaluate(el => el.previousElementSibling.id), 'after')
    await history('Undo', before)
  })
  await check('layout styles are inspected on the currently selected container only', async () => {
    await reset('<article style="padding:96px 32px"><div id="row"><div id="first">Title</div><div id="second">Chapter 3</div></div></article>')
    await select('#row'); await action('Row · align centres'); await computedStyles(true)
    assert.match(await panel.innerText(), /items-center/)
    assert.equal(await panel.locator('[data-computed-property="display"]').innerText(), 'flex')
    await select('#first')
    assert.doesNotMatch(await panel.innerText(), /items-center|div#row|div#second/)
    assert.equal(await recent.count(), 0)
  })
  await check('inline percentages still show actual pixels when an important class blocks resizing', async () => {
    await reset('<article style="padding:96px 32px"><div id="box" class="w-full! h-24">Important width</div></article>'); await select('#box')
    const before = await width()
    await button('Decrease width').click(); await tick()
    assert.equal(await rendered(), rounded(before))
    assert.match(await inline.innerText(), /90%/)
    assert.match(await html(), /w-full!/)
  })
  await check('filtered computed CSS follows the canvas breakpoint without creating edits', async () => {
    await reset('<article style="padding:96px 24px"><div id="box" class="w-1/2 max-sm:w-full h-24">Responsive box</div></article>'); await select('#box')
    await computedStyles(true)
    const before = await html(), desktop = await computed()
    await page.evaluate(() => window.fixtureWidth.select('mobile')); await tick()
    await page.waitForFunction(() => {
      const element = document.querySelector('#box'), canvas = element.closest('.adt-canvas')
      return Math.abs(canvas.getBoundingClientRect().width - 390) < 1
        && document.querySelector('[data-computed-property="width"]').textContent === getComputedStyle(element).width
    })
    assert.equal(await computed(), await width())
    assert.notEqual(await computed(), desktop)
    assert.equal(await html(), before)
    assert.equal(await button('Undo').isDisabled(), true)
    await computedStyles(false)
  })
  await check('custom rules match this element; unrelated selectors, scopes, media and reset properties are absent', async () => {
    await page.evaluate(() => window.fixtureWidth.select('desktop'))
    await page.evaluate(() => {
      const style = document.createElement('style'); style.id = 'inspection-fixture-css'
      style.textContent = `
        .inspection-box { width: 50%; border-radius: 12px; --book-accent: teal; }
        .inspection-other { grid-template-columns: 1fr 2fr; animation-duration: 5s; }
        .missing-parent { .inspection-other, .inspection-box { outline-width: 7px; } }
        @media (min-width: 99999px) { .inspection-box { z-index: 9; } }
        @supports (display: definitely-invalid) { .inspection-box { opacity: .2; } }
        @scope (.missing-scope) { .inspection-box { filter: blur(5px); } }
        @scope (.inspection-box) { :scope { letter-spacing: 2px; } }
        @scope (.adt-canvas) { .inspection-box { &:hover { opacity: .8; } } }
      `
      document.head.append(style)
    })
    await reset('<article style="padding:96px 32px"><div id="box" class="inspection-box">Custom rules</div><div id="other" class="inspection-other">Other rules</div></article>')
    await page.mouse.move(0, 0); await select('#box'); await computedStyles(true)
    const before = await html()
    assert.equal(await computed(), await width())
    assert.equal(await panel.locator('[data-computed-property="border-radius"]').count(), 0, 'CSSOM expands border radius to its actual corner properties')
    assert.equal(await panel.locator('[data-computed-property="border-top-left-radius"]').innerText(), '12px')
    assert.equal(await panel.locator('[data-computed-property="--book-accent"]').innerText(), 'teal')
    assert.equal(await panel.locator('[data-computed-property="letter-spacing"]').innerText(), '2px')
    for (const property of ['grid-template-columns', 'animation-duration', 'z-index', 'opacity', 'filter', 'overflow-x', 'outline-width']) assert.equal(await panel.locator(`[data-computed-property="${property}"]`).count(), 0, property)
    await page.locator('#box').hover(); await tick()
    assert.equal(await panel.locator('[data-computed-property="opacity"]').innerText(), '0.8')
    await page.mouse.move(0, 0); await tick()
    assert.equal(await panel.locator('[data-computed-property="opacity"]').count(), 0)
    await select('#other'); await computedStyles(true)
    assert.equal(await panel.locator('[data-computed-property="width"]').count(), 0)
    assert.equal(await panel.locator('[data-computed-property="animation-duration"]').innerText(), '5s')
    assert.equal(await html(), before)
    assert.equal(await button('Undo').isDisabled(), true)
    await page.evaluate(() => document.querySelector('#inspection-fixture-css').remove())
  })
  await check('images keep their header above the three style accordions', async () => {
    const source = await page.evaluate(() => window.fixtureImageUrl)
    await reset(`<article style="padding:96px 32px"><img id="landscape" src="${source}" alt="Mountain landscape" class="rounded-lg shadow-sm" style="width:60%;max-width:100%;height:auto" /></article>`)
    await select('#landscape')
    const inspector = page.getByRole('complementary', { name: 'Styles', exact: true })
    assert.match(await inspector.locator(':scope > div').first().innerText(), /img/)
    assert.match(await inline.innerText(), /60%/)
    assert.equal(await button('Inline CSS').getAttribute('aria-expanded'), 'true')
    assert.equal(await button('Tailwind Classes').getAttribute('aria-expanded'), 'true')
    assert.equal(await button('Computed CSS').getAttribute('aria-expanded'), 'true')
    await page.screenshot({ path: '.context/responsive-style-accordions.png', animations: 'disabled', clip: { x: 0, y: 0, width: 1146, height: 720 } })
  })
  await check('opaque elements keep access to the existing class editor', async () => {
    await reset('<article><svg id="symbol" class="w-20 h-20" style="width:40%" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg></article>')
    await select('#symbol')
    assert.match(await inline.innerText(), /40%/)
    await button('Edit Tailwind classes').click()
    await button('Remove w-20').click(); await tick()
    assert.doesNotMatch(await html(), /w-20/)
    assert.match(await html(), /<circle/)
    await button('Finish editing classes').click()
  })
  await check('page 15 shows its own inline CSS and a value-only resize tooltip without saving the book', async () => {
    const url = `${origin}/api/books/C-98-Weather-and-Climate---textbook/pages/pg015`
    const book = await (await page.request.get(url)).json()
    const original = book.rendering.sections[0].html
    await reset(original); await select('[data-id="pg015_n0004"]')
    await button('Select parent').first().click(); await tick()
    if (await button('Wrap in container').count()) {
      await button('Wrap in container').first().click()
      await page.getByRole('dialog').getByRole('button', { name: 'Wrap in container', exact: true }).click()
      await tick()
    }
    await button('Drag to resize width').last().waitFor({ state: 'visible' })
    const before = await html()
    await dragStart('Drag to resize width', -30, 0)
    assert.match(await tooltip.innerText(), /width/)
    assert.doesNotMatch(await tooltip.innerText(), /Chapter 3|Inline CSS/)
    const tipBounds = await tooltip.boundingBox(), panelBounds = await panel.boundingBox()
    assert.ok(tipBounds.x + tipBounds.width <= panelBounds.x)
    await page.screenshot({ path: '.context/responsive-style-inspection-weather.png', animations: 'disabled', clip: { x: 0, y: 0, width: 1146, height: 560 } })
    await page.mouse.up(); await tick()
    assert.match(await inline.innerText(), /width/)
    assert.equal(await recent.count(), 0)
    await history('Undo', before)
    const after = await (await page.request.get(url)).json()
    assert.deepEqual(after.versions, book.versions)
    assert.equal(after.rendering.sections[0].html, original)
  })
  await check('the actual workspace retains style-section choices across tabs, panel collapse, pages and reloads', async () => {
    const book = 'C-98-Weather-and-Climate---textbook'
    async function ready() {
      await page.locator('.adt-canvas p').first().waitFor()
      // The development diagnostics toolbar covers the panel's reopen button.
      await page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname.endsWith('/deps/react-scan.js'))
        if (url) (await import(url)).setOptions({ enabled: false, showToolbar: false })
      })
    }
    async function selectParagraph() {
      await ready()
      await page.locator('.adt-canvas p').first().click(); await tick()
      await button('Inline CSS').waitFor()
    }
    async function remembered() {
      for (const [name, open] of [['Inline CSS', false], ['Tailwind Classes', false], ['Computed CSS', true]]) {
        assert.equal(await button(name).getAttribute('aria-expanded'), String(open), name)
      }
    }
    await page.goto(`${origin}/pipeline/${book}/pages/pg013`)
    await ready()
    if (await button('Show the panel').isVisible()) await button('Show the panel').click()
    await page.getByRole('tab', { name: 'Styles', exact: true }).click()
    await selectParagraph()
    for (const [name, open] of [['Inline CSS', false], ['Tailwind Classes', false], ['Computed CSS', true]]) {
      if (await button(name).getAttribute('aria-expanded') !== String(open)) await button(name).click()
    }
    await page.getByRole('tab', { name: 'AI', exact: true }).click()
    await page.getByRole('tab', { name: 'Styles', exact: true }).click(); await remembered()
    await button('Hide the panel').click(); await button('Show the panel').click(); await remembered()
    await page.goto(`${origin}/pipeline/${book}/pages/pg015`); await selectParagraph(); await remembered()
    await page.reload(); await selectParagraph(); await remembered()
  })
  assert.deepEqual(errors, []); assert.deepEqual(writes, [])
  console.log(`${passed} style-inspection checks passed; no book writes`)
} finally { await browser.close() }
