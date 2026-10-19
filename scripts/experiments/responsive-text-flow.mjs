import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'
// Public editor controls on in-memory fixtures and a read-only weather page copy.
const origin=process.env.STUDIO_URL ?? 'http://localhost:5173'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1100,height:1100}})
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
 const {createRoot}=(await import(module('react-dom_client'))).default
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
const words='Water evaporates from oceans and lakes. Warm air carries the water vapor into the atmosphere where it can form clouds. '
const fixture=`<article id="page" style="padding:24px;max-width:800px;margin:auto"><h2 id="heading">Weather</h2><div id="outer" class="grid grid-cols-1 gap-6"><div id="inner" class="grid grid-cols-2 gap-6"><p id="first"><span data-id="text-1">${words}</span></p><aside id="aside" style="padding:20px;min-height:280px;background:#d1fae5"><h3 data-id="vocab">Vocabulary</h3><p>Evaporate: change from liquid to gas.</p></aside></div><p id="second"><span data-id="text-2">${words.repeat(3)}</span></p><div id="empty" class="grid grid-cols-2"></div></div><p id="third"><span data-id="text-3">${words.repeat(3)}</span></p><div id="activity" style="padding:20px;background:#fef3c7"><label for="answer">Your answer</label><textarea id="answer" data-activity-item="answer"></textarea></div></article>`
async function reset(value=fixture){await page.evaluate(value=>window.fixtureEditor.replaceDocument(value),value);await tick()}
async function select(selector){await page.evaluate(selector=>window.fixtureEditor.select(document.querySelector(selector).dataset.adtId),selector);await tick()}
async function action(name){await button('Component layout').click();await button(name).click();await tick()}
async function multi(selectors){await page.evaluate(selectors=>window.fixtureEditor.selectMany(selectors.map(selector=>document.querySelector(selector).dataset.adtId)),selectors);await tick()}
async function undo(before){await button('Undo').click();await tick();assert.equal(await html(),before)}
const content=()=>page.locator('.adt-canvas').evaluate(root=>{
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),texts=[];while(walker.nextNode()){const text=walker.currentNode.textContent.trim();if(text)texts.push(text)}
 return {texts:texts.sort(),ids:[...root.querySelectorAll('[id], [data-id]')].map(el=>[el.id,el.getAttribute('data-id')]).sort(),images:[...root.querySelectorAll('img')].map(el=>[el.getAttribute('src'),el.getAttribute('alt')]),links:[...root.querySelectorAll('label,textarea')].map(el=>[el.getAttribute('for'),el.id,el.getAttribute('data-activity-item')])}
})
async function wraps(asideSelector,textSelector,side){
 assert.equal(await page.locator(asideSelector).evaluate(el=>getComputedStyle(el).float),side)
 assert.equal(await page.evaluate(({asideSelector,textSelector,side})=>{
  const aside=document.querySelector(asideSelector).getBoundingClientRect(),text=document.querySelector(textSelector)
  const range=document.createRange();range.selectNodeContents(text)
  const lines=[...range.getClientRects()].filter(rect=>rect.width>0&&rect.top<aside.bottom&&rect.bottom>aside.top)
  return lines.length>0&&lines.every(line=>side==='right'?line.right<=aside.left+1:line.left>=aside.right-1)
 },{asideSelector,textSelector,side}),true)
}
await reset()
await check('selecting the inner grid wraps the second paragraph and restores full width below the aside',async()=>{
 const before=await html(),copy=await content(),activity=await page.locator('#activity').innerHTML()
 await select('#inner');await action('Wrap text · object on right')
 await wraps('#aside','#second','right')
 assert.equal(await page.locator('#third').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const aside=document.querySelector('#aside').getBoundingClientRect();return [...range.getClientRects()].some(rect=>rect.top>=aside.bottom&&rect.right>aside.left+40)}),true)
 assert.deepEqual(await content(),copy);assert.equal(await page.locator('#activity').innerHTML(),activity)
 assert.equal(await page.locator('#inner').count(),1);assert.equal(await page.locator('#outer').count(),1)
 assert.equal(await page.locator('#aside').evaluate(el=>el.parentElement.contains(document.querySelector('#second'))),true)
 const after=await html();assert.doesNotMatch(after,/data-adt-id|data-arrange/)
 await undo(before);await button('Redo').click();assert.equal(await html(),after)
 await reset(after);await wraps('#aside','#second','right')
})
await reset()
await check('aside selection changes side repeatedly without accumulating wrappers and stacks on mobile',async()=>{
 const before=await html();await select('#aside');await action('Wrap text · object on left');await wraps('#aside','#second','left')
 const count=await page.locator('.adt-canvas *').count()
 await action('Wrap text · object on right');await wraps('#aside','#second','right')
 assert.equal(await page.locator('.adt-canvas *').count(),count)
 await page.setViewportSize({width:390,height:1100});await tick()
 assert.equal(await page.locator('#aside').evaluate(el=>getComputedStyle(el).float),'none')
 assert.equal(await page.locator('#first').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('#aside').getBoundingClientRect().bottom),true)
 assert.equal(await page.locator('.adt-canvas').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
 await button('Undo').click();await undo(before)
 await page.setViewportSize({width:1100,height:1100});await tick()
})
await reset()
await check('dragging an aside beside text inside a grid previews wrapping and commits it',async()=>{
 const before=await html();await select('#aside');await button('Drag to reposition component').click();await tick()
 const a=await page.locator('#aside').boundingBox(),b=await page.locator('#first').boundingBox()
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down()
 await page.mouse.move(b.x+b.width*.9,b.y+b.height*.5,{steps:12});await tick()
 assert.match(await page.getByRole('status').innerText(),/Wrap text.*right/)
 await page.mouse.up();await tick();await wraps('#aside','#second','right');await undo(before)
})
const flat=`<article id="flat" style="padding:24px"><p id="first">${words}</p><aside id="aside" style="padding:20px;min-height:250px;background:#d1fae5">Vocabulary</aside><p id="second">${words.repeat(4)}</p><h2 id="end">Next topic</h2></article>`
await reset(flat)
await check('Shift-click selection exposes a group menu and wraps only the selected items',async()=>{
 const before=await html();await page.locator('#first').click();await page.locator('#aside').click({modifiers:['Shift']});await page.locator('#second').click({modifiers:['Shift']});await tick()
 assert.equal(await page.getByRole('toolbar',{name:'Group layout controls'}).count(),1)
 await action('Wrap text · object on right');await wraps('#aside','#second','right')
 assert.equal(await page.locator('#aside').evaluate(el=>el.parentElement.contains(document.querySelector('#end'))),false)
 await undo(before)
})
await reset(flat)
await check('multiple selected neighbours support equal columns and stacking with single-step undo',async()=>{
 const before=await html();await multi(['#first','#aside']);await action('Side by side · equal columns')
 assert.equal(await page.locator('#aside').evaluate(el=>{const a=document.querySelector('#first').getBoundingClientRect(),b=el.getBoundingClientRect();return Math.abs(a.top-b.top)<1&&b.left>=a.right&&Math.abs(a.width-b.width)<1}),true)
 await undo(before);await multi(['#first','#aside']);await action('One below another')
 assert.equal(await page.locator('#aside').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('#first').getBoundingClientRect().bottom),true)
 await undo(before)
})
await reset(flat)
await check('non-neighbour and locked selections explain or disable changes without mutating content',async()=>{
 const before=await html();await multi(['#first','#second']);await button('Component layout').click()
 assert.equal(await button('Side by side · equal columns').isDisabled(),true);await page.keyboard.press('Escape')
 await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#aside').dataset.adtId,true));await multi(['#first','#aside'])
 await button('Component layout').click();assert.equal(await button('Wrap text · object on right').isDisabled(),true);await page.keyboard.press('Escape')
 assert.equal(await html(),before)
})
await reset(fixture)
await check('locks on affected nested text prevent conversion through container or drag',async()=>{
 await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#second').dataset.adtId,true));await select('#aside')
 const before=await html();await button('Component layout').click();assert.equal(await button('Wrap text · object on right').isDisabled(),true)
 await page.keyboard.press('Escape');assert.equal(await html(),before)
})
await reset(`<article style="padding:24px"><div id="cards" class="grid grid-cols-2"><div style="background:#eee;padding:12px"><p>${words}</p></div><aside id="aside">Vocabulary</aside></div><div id="diagram" style="position:relative"><img id="image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3C/svg%3E"><span style="position:absolute;top:0">Label</span></div></article>`)
await check('decorated cards and diagrams are not flattened into a text flow',async()=>{
 const before=await html();await select('#cards');await button('Component layout').click()
 assert.equal(await button('Wrap text · object on right').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await html(),before)
})
// Run the same action against the latest stored page without saving anything.
const endpoint=`${origin}/api/books/C-98-Weather-and-Climate---textbook/pages/pg013`
const baseline=await (await page.request.get(endpoint)).json()
await reset(baseline.rendering.sections[0].html)
await check('weather page 13 wraps all three paragraphs, preserves activity links and round-trips',async()=>{
 const before=await html(),copy=await content()
 await select('.adt-canvas aside');await action('Wrap text · object on right')
 await wraps('.adt-canvas aside','[data-id="pg013_n0008"]','right')
 assert.deepEqual(await content(),copy)
 assert.equal(await page.locator('label[for="item-1"]').count(),1);assert.equal(await page.locator('#item-1[data-activity-item="item-1"]').count(),1)
 await page.evaluate(()=>window.fixtureEditor.select(null));await tick()
 await page.screenshot({path:'.context/weather-page13-text-flow.png',animations:'disabled'})
 const after=await html();await reset(after);await wraps('.adt-canvas aside','[data-id="pg013_n0008"]','right')
 await page.setViewportSize({width:390,height:1100});await tick()
 assert.equal(await page.locator('.adt-canvas aside').evaluate(el=>getComputedStyle(el).float),'none')
 assert.equal(await page.locator('.adt-canvas').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
 assert.deepEqual(await content(),copy)
 await page.screenshot({path:'.context/weather-page13-text-flow-mobile.png',animations:'disabled'})
 await page.setViewportSize({width:1100,height:1100});await reset(before)
})
await page.setViewportSize({width:1440,height:1000})
await page.goto(`${origin}/pipeline/C-98-Weather-and-Climate---textbook/pages/pg013`)
await page.locator('.adt-canvas aside').first().waitFor();await tick()
// Hide development render diagnostics for the screenshot, using its public API.
await page.evaluate(async()=>{
 const url=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname.endsWith('/deps/react-scan.js'))
 if(url)(await import(url)).setOptions({enabled:false,showToolbar:false})
})
await check('page 13 container menu works in the real Storyboard shell with both rails open',async()=>{
 const width=(await page.locator('.adt-canvas').boundingBox()).width
 assert.ok(width>640&&width<1024,`Actual canvas width ${width}`)
 const copy=await content()
 const side=await page.locator('.adt-canvas aside').evaluate(el=>getComputedStyle(el).float==='right'?'left':'right')
 const levels=await page.locator('[data-id="pg013_n0004"]').evaluate(el=>{let count=0;while(el&&!el.querySelector('aside')){el=el.parentElement;count++}return count})
 await page.locator('[data-id="pg013_n0004"]').click();await tick()
 for(let index=0;index<levels;index++){await page.getByRole('toolbar',{name:'Quick layout controls'}).getByRole('button',{name:'Select parent',exact:true}).click();await tick()}
 await action(side==='right'?'Wrap text · object on right':'Wrap text · object on left')
 await wraps('.adt-canvas aside','[data-id="pg013_n0008"]',side);assert.deepEqual(await content(),copy)
 await page.waitForTimeout(1200);await page.screenshot({path:'.context/weather-page13-workspace-flow.png',animations:'disabled'})
 await button('Undo').click();await tick();assert.deepEqual(await content(),copy)
 assert.equal(await button('Undo').isDisabled(),true)
})
const saved=await (await page.request.get(endpoint)).json()
assert.deepEqual(saved.rendering,baseline.rendering);assert.deepEqual(saved.versions,baseline.versions)
assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
await browser.close();console.log(`${passed} text-flow checks passed; no browser errors or book writes`)
