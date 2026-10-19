import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'
// Public editor controls on in-memory fixtures and a read-only weather page copy.
const origin=process.env.STUDIO_URL ?? 'http://localhost:5173'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:826,height:1050}})
const errors=[],writes=[]
page.on('pageerror',error=>errors.push(error.message))
page.on('request',request=>{if(request.url().includes('/api/books/')&&!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+request.url())})
const button=name=>page.getByRole('button',{name,exact:true})
const tick=()=>page.waitForTimeout(180)
let passed=0
async function check(name,run){await run();console.log('PASS',name);passed++}
await page.goto(`${origin}/responsive-playground.html`)
await page.locator('#demo-image').waitFor()
await page.evaluate(async()=>{
 const resources=performance.getEntriesByType('resource').map(e=>e.name)
 const module=name=>resources.find(url=>new URL(url).pathname.endsWith(`/deps/${name}.js`))
 const React=(await import(module('react'))).default
 const reactDom=await import(module('react-dom_client'))
 const {createRoot}=reactDom.default??reactDom
 const {HtmlEditor}=await import(module('adt-html-editor_shadcn'))
 const {useEditor}=await import(module('adt-html-editor'))
 const {I18nProvider}=await import(module('@lingui_react'))
 const {i18n}=await import(module('@lingui_core'))
 const {ResponsiveCanvas}=await import('/src/components/app/screens/pipeline/editor/responsive/ResponsiveCanvas.tsx')
 function Capture(){window.fixtureEditor=useEditor();return null}
 document.querySelector('#root').remove()
 const host=document.createElement('div');document.body.append(host)
 const h=React.createElement
 function App(){
  const [html,setHtml]=React.useState('<p>Fixture</p>')
  return h(I18nProvider,{i18n},h(HtmlEditor,{value:html,onChange:setHtml,layout:'flow',className:'flex h-dvh'},h(Capture),
   h(HtmlEditor.Canvas,{className:'flex-1 min-w-0'},h(HtmlEditor.Canvas.Toolbar,null,h(HtmlEditor.History)),h(ResponsiveCanvas))))
 }
 createRoot(host).render(h(App))
})
await page.locator('.adt-canvas p').waitFor()
const html=()=>page.evaluate(()=>window.fixtureEditor.getHtml())
async function reset(value){await page.evaluate(value=>window.fixtureEditor.replaceDocument(value),value);await tick()}
async function select(selector){await page.evaluate(selector=>window.fixtureEditor.select(document.querySelector(selector).dataset.adtId),selector);await tick()}
async function multi(selectors){await page.evaluate(selectors=>window.fixtureEditor.selectMany(selectors.map(selector=>document.querySelector(selector).dataset.adtId)),selectors);await tick()}
async function action(name){await button('Component layout').click();await button(name).click();await tick()}
async function undo(before){await button('Undo').click();await tick();assert.equal(await html(),before)}
const endpoint=`${origin}/api/books/C-98-Weather-and-Climate---textbook/pages/pg011`
const baseline=await (await page.request.get(endpoint)).json()
const bookHtml=baseline.rendering.sections[0].html
await reset(bookHtml)
const title='[data-id="pg011_n0002"]',chapter='[data-id="pg011_n0005"]'
const content=()=>page.locator('.adt-canvas [data-id], .adt-canvas img').evaluateAll(els=>els.map(el=>[el.getAttribute('data-id'),el.textContent,el.getAttribute('src'),el.getAttribute('alt')]).sort(([a],[b])=>(a??'').localeCompare(b??'')))
async function centers(){assert.equal(await page.locator(title).evaluate(el=>{const title=el.getBoundingClientRect(),card=el.nextElementSibling.getBoundingClientRect();return Math.abs(title.top+title.height/2-card.top-card.height/2)<1&&card.left>=title.right}),true)}
async function dragHeight(delta,finish=true){
 const handle=await button('Drag to change height').boundingBox();assert.ok(handle)
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down()
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2+delta,{steps:10});await tick()
 if(finish){await page.mouse.up();await tick()}
}
await check('page 11 title and nested chapter label select complete visual siblings and align their centres',async()=>{
 const before=await html(),copy=await content()
 await multi([title,chapter]);await action('Row · align centres');await centers()
 assert.deepEqual(await content(),copy)
 assert.equal(await page.locator(title).evaluate(el=>getComputedStyle(el.parentElement).flexDirection),'row')
 const after=await html();await undo(before);await button('Redo').click();assert.equal(await html(),after)
})
await reset(bookHtml)
await check('row presets align tops and bottoms through the nested header wrappers',async()=>{
 const before=await html()
 await select('.adt-canvas section > div:first-child');await action('Row · align tops')
 assert.equal(await page.locator(title).evaluate(el=>Math.abs(el.getBoundingClientRect().top-el.nextElementSibling.getBoundingClientRect().top)<1),true)
 await action('Row · align bottoms')
 assert.equal(await page.locator(title).evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-el.nextElementSibling.getBoundingClientRect().bottom)<1),true)
 await button('Undo').click();await undo(before)
})
await reset(bookHtml)
await check('Centre contents removes the empty grid row while retaining IDs, text and typography',async()=>{
 const before=await html(),copy=await content()
 await select(chapter);await action('Centre contents')
 assert.equal(await page.locator(chapter).evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return Math.abs(a.top+a.height/2-b.top-b.height/2)<1&&Math.abs(a.left+a.width/2-b.left-b.width/2)<1}),true)
 assert.equal(await page.locator('[data-id="pg011_n0007"]').count(),1)
 assert.equal(await page.locator('[data-id="pg011_n0007"]').evaluate(el=>getComputedStyle(el).display),'none')
 assert.equal(await page.locator(chapter).evaluate(el=>getComputedStyle(el).fontSize),'24px')
 assert.deepEqual(await content(),copy);await undo(before)
})
await reset(bookHtml)
await multi([title,chapter]);await action('Row · align centres');await select(chapter);await action('Centre contents')
await check('inner-space fields free room for the chapter label, agree with geometry and undo once',async()=>{
 const before=await html()
 await button('Size and spacing').click()
 await page.getByRole('spinbutton',{name:'Horizontal inner space',exact:true}).fill('0')
 await page.getByRole('spinbutton',{name:'Horizontal inner space',exact:true}).press('Enter');await tick()
 assert.equal(await page.locator(chapter).evaluate(el=>getComputedStyle(el.parentElement).paddingLeft),'0px')
 assert.equal(await page.locator(chapter).evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length}),1)
 assert.equal(await page.getByRole('spinbutton',{name:'Horizontal inner space',exact:true}).inputValue(),'0')
 await page.keyboard.press('Escape');await undo(before)
})
await select('.adt-canvas section > div:first-child')
await check('dragging the header height reduces nested padding, preserves content and keeps one undo',async()=>{
 const before=await html(),copy=await content(),bar=page.locator('.adt-canvas section > div:first-child')
 const start=(await bar.boundingBox()).height
 await dragHeight(-28)
 const end=(await bar.boundingBox()).height
 assert.ok(end<start-20,`${start} -> ${end}`);assert.deepEqual(await content(),copy)
 assert.equal(await bar.evaluate(el=>el.scrollHeight<=el.clientHeight+1),true)
 await button('Size and spacing').click()
 assert.equal(Number(await page.getByRole('spinbutton',{name:'Height',exact:true}).inputValue()),Math.round(end))
 await page.keyboard.press('Escape');await undo(before)
})
await check('height stops at content minimum instead of clipping and expands with centred content',async()=>{
 const before=await html(),bar=page.locator('.adt-canvas section > div:first-child')
 await dragHeight(-600)
 assert.match(await page.getByRole('status').innerText(),/content needs this space/)
 assert.equal(await bar.evaluate(el=>el.scrollHeight<=el.clientHeight+1),true)
 assert.equal(await page.locator(title).evaluate(el=>{const a=el.getBoundingClientRect(),b=el.nextElementSibling.getBoundingClientRect(),bar=el.closest('section').firstElementChild.getBoundingClientRect();return a.top>=bar.top&&b.top>=bar.top&&a.bottom<=bar.bottom+1&&b.bottom<=bar.bottom+1}),true)
 await undo(before)
 await dragHeight(100)
 assert.equal(await bar.evaluate(el=>{const b=el.getBoundingClientRect(),child=el.firstElementChild.getBoundingClientRect();return Math.abs(b.top+b.height/2-child.top-child.height/2)<1}),true)
 await undo(before)
})
for(const cancellation of ['Escape','pointercancel','reset']){
 await check(`height ${cancellation} restores all wrapper previews without a history entry`,async()=>{
  const before=await html();await dragHeight(-24,false)
  if(cancellation==='Escape')await page.keyboard.press('Escape')
  else if(cancellation==='pointercancel')await page.dispatchEvent('.adt-canvas section > div:first-child','pointercancel',{pointerId:1})
  else await reset(before)
  await page.mouse.up();await tick();assert.equal(await html(),before)
 })
 if(cancellation==='reset')await select('.adt-canvas section > div:first-child')
}
await reset(bookHtml)
await multi([title,chapter]);await action('Row · align centres');await select(chapter);await action('Centre contents')
await button('Size and spacing').click();await page.getByRole('spinbutton',{name:'Horizontal inner space',exact:true}).fill('0');await page.getByRole('spinbutton',{name:'Horizontal inner space',exact:true}).press('Enter');await page.keyboard.press('Escape');await tick()
await select('.adt-canvas section > div:first-child');await dragHeight(-24)
await page.evaluate(()=>window.fixtureEditor.select(null));await tick()
await page.screenshot({path:'.context/weather-page11-visual-header.png',animations:'disabled'})
await check('header edits round-trip and stack in reading order without clipping on mobile',async()=>{
 const after=await html(),copy=await content();await reset(after);await centers()
 assert.doesNotMatch(after,/data-adt-id|data-arrange/)
 await page.setViewportSize({width:390,height:1050});await tick()
 assert.equal(await page.locator(title).evaluate(el=>{const a=el.getBoundingClientRect(),b=el.nextElementSibling.getBoundingClientRect();return b.top>=a.bottom}),true)
 assert.equal(await page.locator('.adt-canvas').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
 assert.equal(await page.locator('.adt-canvas section > div:first-child').evaluate(el=>el.scrollHeight<=el.clientHeight+1),true)
 assert.deepEqual(await content(),copy)
 await page.screenshot({path:'.context/weather-page11-visual-mobile.png',animations:'disabled'})
 await page.setViewportSize({width:826,height:1050});await tick()
})
await reset(bookHtml)
await check('locked descendants disable centring, row changes and height controls',async()=>{
 await page.evaluate(chapter=>window.fixtureEditor.setLocked(document.querySelector(chapter).dataset.adtId,true),chapter)
 await select('.adt-canvas section > div:first-child');await button('Component layout').click()
 assert.equal(await button('Row · align centres').isDisabled(),true);await page.keyboard.press('Escape')
 assert.equal(await button('Drag to change height').count(),0)
 await multi([title,chapter]);await button('Component layout').click();assert.equal(await button('Row · align centres').isDisabled(),true);await page.keyboard.press('Escape')
})
await page.setViewportSize({width:1440,height:1000})
await page.goto(`${origin}/pipeline/C-98-Weather-and-Climate---textbook/pages/pg011`)
await page.locator(title).waitFor();await tick()
await page.evaluate(async()=>{
 const url=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname.endsWith('/deps/react-scan.js'))
 if(url)(await import(url)).setOptions({enabled:false,showToolbar:false})
})
await check('page 11 Shift-click, centring and height editing work in the real Storyboard shell',async()=>{
 const copy=await content(),original=(await page.locator('.adt-canvas section > div:first-child').boundingBox()).height
 await page.locator(title).click();await page.locator(chapter).click({modifiers:['Shift']});await tick()
 await action('Row · align centres');await centers()
 await page.locator(chapter).click();await tick();await action('Centre contents')
 await button('Size and spacing').click();await page.getByRole('spinbutton',{name:'Horizontal inner space',exact:true}).fill('0');await page.getByRole('spinbutton',{name:'Horizontal inner space',exact:true}).press('Enter');await page.keyboard.press('Escape');await tick()
 const parent=()=>page.getByRole('toolbar',{name:'Quick layout controls'}).getByRole('button',{name:'Select parent',exact:true})
 for(let index=0;index<4;index++){await parent().click();await tick()}
 await dragHeight(-24)
 const current=(await page.locator('.adt-canvas section > div:first-child').boundingBox()).height
 assert.ok(current<original,`${original} -> ${current}`);await centers();assert.deepEqual(await content(),copy)
 await page.keyboard.press('Escape');await page.waitForTimeout(1200)
 await page.screenshot({path:'.context/weather-page11-workspace-header.png',animations:'disabled'})
 for(let index=0;index<4;index++){await button('Undo').click();await tick()}
 assert.equal(await button('Undo').isDisabled(),true);assert.deepEqual(await content(),copy)
})
const saved=await (await page.request.get(endpoint)).json()
assert.deepEqual(saved.rendering,baseline.rendering);assert.deepEqual(saved.versions,baseline.versions)
assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
await browser.close();console.log(`${passed} visual-layout checks passed; no browser errors or book writes`)
