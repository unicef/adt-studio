import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'
// Tests direct-body routing and the explicit handle on in-memory editor documents.
const origin=process.env.STUDIO_URL ?? 'http://localhost:5173'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1300,height:1050}})
page.setDefaultTimeout(15000)
const errors=[],writes=[]
page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
page.on('request',r=>{if(r.url().includes('/api/books/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.method()+' '+r.url())})
const button=name=>page.getByRole('button',{name,exact:true})
const tick=()=>page.waitForTimeout(150)
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
 const {useEditor,useSelectedIds}=await import(module('adt-html-editor'))
 const {I18nProvider}=await import(module('@lingui_react'))
 const {i18n}=await import(module('@lingui_core'))
 const {ResponsiveCanvas}=await import('/src/components/app/screens/pipeline/editor/responsive/ResponsiveCanvas.tsx')
 function Capture(){window.fixtureEditor=useEditor();window.fixtureSelection=useSelectedIds();return null}
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
const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#b7d4c7"/><path d="M0 160 100 30 220 160" fill="#527465"/></svg>')
const words='Warm air carries water from oceans and lakes into the atmosphere where it forms clouds. '
const fixture=`<article id="page" style="padding:80px 32px 32px;max-width:1000px;margin:auto"><aside id="aside" style="padding:16px;background:#fef3c7;width:32%;margin-bottom:20px"><h2>Vocabulary</h2><p id="aside-text">Evaporation turns water into vapor.</p></aside><p id="intro">${words.repeat(4)}</p><div id="columns" class="grid grid-cols-2 gap-6" style="margin-top:24px"><div id="source-column"><figure id="figure" style="padding:16px;background:#e7efe8"><img id="image" src="${art}" style="display:block;width:50%;height:auto"><figcaption id="caption">A mountain landscape</figcaption></figure></div><div id="destination" style="min-height:160px;padding:16px;background:#f1f5f9"><p id="destination-text">Another column</p></div></div><div id="plain" style="width:70%;margin-top:24px"><p id="plain-text">A simple text wrapper.</p></div><p id="end" style="margin-top:24px">End of section</p></article>`
const html=()=>page.evaluate(()=>window.fixtureEditor.getHtml())
async function reset(value=fixture){await page.evaluate(value=>window.fixtureEditor.replaceDocument(value),value);await tick()}
async function select(selector){await page.evaluate(selector=>window.fixtureEditor.select(document.querySelector(selector).dataset.adtId),selector);await tick()}
const box=selector=>page.locator(selector).boundingBox()
const center=b=>({x:b.x+b.width/2,y:b.y+b.height/2})
async function drag(from,to,finish=true){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await tick();if(finish){await page.mouse.up();await tick()}}
async function undo(before){await button('Undo').click();await tick();assert.equal(await html(),before)}
async function selected(selector){assert.equal(await page.evaluate(selector=>window.fixtureSelection[0]===document.querySelector(selector).dataset.adtId,selector),true)}

await reset()
await check('aside body drag previews wrapping without a mode, commits once, and stacks on mobile',async()=>{
 const before=await html(),content=await page.locator('#aside').innerHTML()
 await select('#aside');assert.equal(await button('Drag to reposition component').getAttribute('aria-pressed'),'false')
 const target=await box('#intro')
 await drag(center(await box('#aside-text')),{x:target.x+target.width*.9,y:target.y+target.height/2},false)
 assert.equal(await html(),before);assert.equal(await page.locator('[data-arrange-ghost]').count(),1)
 assert.match(await page.getByRole('status').innerText(),/Wrap text.*right/)
 await page.screenshot({path:'.context/responsive-smart-move-preview.png'})
 await page.mouse.up();await tick()
 assert.equal(await page.locator('#aside').evaluate(el=>getComputedStyle(el).float),'right')
 assert.equal(await page.locator('#aside').innerHTML(),content)
 await selected('#aside')
 const after=await html();await undo(before);await button('Redo').click();await tick();assert.equal(await html(),after)
 await page.setViewportSize({width:390,height:1050});await tick()
 assert.equal(await page.locator('#aside').evaluate(el=>getComputedStyle(el).float),'none')
 assert.equal(await page.locator('.adt-canvas').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
 await page.setViewportSize({width:1300,height:1050});await tick()
})
await reset()
await check('selected figure drags over its image into another column with its caption intact',async()=>{
 const before=await html(),content=await page.locator('#figure').innerHTML()
 await select('#figure');await drag(center(await box('#image')),center(await box('#destination')))
 assert.equal(await page.locator('#destination > #figure').count(),1)
 assert.equal(await page.locator('#figure').innerHTML(),content)
 await selected('#figure');await undo(before)
})
await reset()
await check('handle highlights and moves the whole figure when only its image is selected',async()=>{
 const before=await html();await select('#image')
 const handle=button('Drag to reposition component');await handle.hover();await tick()
 assert.match(await handle.innerText(),/figure/)
 const outline=await page.locator('[data-component-move-outline]').boundingBox(),figure=await box('#figure')
 assert.ok(Math.abs(outline.width-figure.width)<1&&Math.abs(outline.height-figure.height)<1)
 const toolbar=await page.getByRole('toolbar',{name:'Quick layout controls'}).boundingBox(),tab=await handle.boundingBox()
 assert.ok(tab.y>=toolbar.y&&tab.y+tab.height<=toolbar.y+toolbar.height,'Move handle is inside the toolbar')
 assert.equal(await page.locator('[data-component-move-handle]').count(),1)
 assert.equal(await page.getByRole('toolbar',{name:'Quick layout controls'}).locator('[data-component-move-handle]').count(),1)
 assert.equal(await button('Arrange component').count(),0)
 assert.equal(await button('Drag to align or reorder').count(),0)
 await page.screenshot({path:'.context/responsive-smart-move-handle.png'})
 await drag(center(await handle.boundingBox()),center(await box('#destination')))
 assert.equal(await page.locator('#destination > #figure > #caption').count(),1)
 assert.equal(await button('Drag to reposition component').getAttribute('aria-pressed'),'false','releasing a drag must not toggle Move mode')
 assert.doesNotMatch(await html(),/data-component-move|data-arrange|data-adt-id/)
 await undo(before)
})
await reset()
await check('image body still aligns within its figure and never switches to smart Move mid-drag',async()=>{
 const before=await html();await select('#image')
 const from=center(await box('#image')),target=await box('#figure')
 await drag(from,{x:target.x+target.width-25,y:from.y},false)
 assert.equal(await page.locator('[data-arrange-ghost]').count(),0)
 assert.equal(await page.locator('#image').evaluate(el=>el.style.marginLeft),'auto')
 await page.mouse.up();await tick();assert.equal(await page.locator('#figure > #image').count(),1)
 await undo(before)
})
await reset()
await check('plain text wrappers and paragraphs retain alignment; their handle still supports smart Move',async()=>{
 for(const selector of ['#plain','#plain-text']){
  await select(selector);const before=await html(),from=center(await box(selector)),target=await box(selector==='#plain'?'#page':'#plain')
  await drag(from,{x:target.x+target.width-20,y:from.y},false)
  assert.equal(await page.locator('[data-arrange-ghost]').count(),0)
  await page.mouse.up();await tick()
  assert.equal(await page.locator(selector).evaluate(el=>el.tagName==='P'?el.style.textAlign:el.style.marginLeft),selector==='#plain'?'auto':'right')
  await undo(before)
 }
 await select('#plain');await drag(center(await button('Drag to reposition component').boundingBox()),center(await box('#destination')))
 assert.equal(await page.locator('#destination > #plain > #plain-text').count(),1)
})
await reset()
await check('click selects a child and double-click enters text editing without a move or history entry',async()=>{
 const before=await html();await select('#figure');await page.locator('#image').click();await tick();await selected('#image')
 await select('#aside');await page.locator('#aside-text').dblclick();await tick()
 assert.equal(await page.locator('[contenteditable="true"]').count(),1)
 assert.equal(await button('Drag to reposition component').count(),0)
 assert.equal(await html(),before);assert.equal(await button('Undo').isDisabled(),true)
 await page.keyboard.press('Escape')
})
for(const cancellation of ['Escape','pointercancel','blur','selection','reset','lock']){
 await reset()
 await check(`${cancellation} cancels automatic dragging without a document mutation`,async()=>{
  const before=await html();await select('#figure');await drag(center(await box('#image')),center(await box('#destination')),false)
  assert.equal(await page.locator('[data-arrange-ghost]').count(),1)
  if(cancellation==='Escape')await page.keyboard.press('Escape')
  else if(cancellation==='pointercancel')await page.dispatchEvent('#image','pointercancel',{pointerId:1})
  else if(cancellation==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')))
  else if(cancellation==='selection')await select('#end')
  else if(cancellation==='reset')await reset()
  else await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#figure').dataset.adtId,true))
  await page.mouse.up();await tick()
  assert.equal(await html(),before);assert.equal(await page.locator('[data-arrange-ghost]').count(),0)
  assert.equal(await button('Undo').isDisabled(),true)
  if(cancellation==='lock')await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#figure').dataset.adtId,false))
 })
}
await reset()
await check('corners, height and spacing still resize selected smart-movable containers',async()=>{
 await select('#aside')
 for(const name of ['Drag to resize width','Drag to change height','Drag to change space below']){
  const before=await html(),handle=page.getByRole('button',{name,exact:true}).last(),from=center(await handle.boundingBox())
  await drag(from,{x:from.x+60,y:from.y+32},false)
  assert.equal(await page.locator('[data-arrange-ghost]').count(),0)
  await page.mouse.up();await tick();assert.notEqual(await html(),before);await undo(before)
 }
})
await reset()
await check('locked components disable Move, locked destinations reject drops, Shift-click still groups',async()=>{
 await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#image').dataset.adtId,true))
 await select('#figure');assert.equal(await button('Drag to reposition component').isDisabled(),true)
 const protectedHtml=await html();await drag(center(await box('#caption')),center(await box('#end')))
 assert.equal(await html(),protectedHtml);assert.equal(await page.locator('[data-arrange-ghost]').count(),0)
 await page.evaluate(()=>{window.fixtureEditor.setLocked(document.querySelector('#image').dataset.adtId,false);window.fixtureEditor.setLocked(document.querySelector('#destination').dataset.adtId,true)})
 await select('#figure');const before=await html();await drag(center(await box('#image')),center(await box('#destination')))
 assert.equal(await html(),before)
 await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#destination').dataset.adtId,false))
 await page.locator('#end').click({modifiers:['Shift']});await tick()
 assert.equal(await page.evaluate(()=>window.fixtureSelection.length),2)
 assert.equal(await button('Drag to reposition component').count(),0)
})
await reset()
await check('decorated cards drag as a unit while embedded controls keep their normal pointer behavior',async()=>{
 const value=`<article style="padding:80px 32px"><div id="card" style="padding:20px;background:#eee;margin-bottom:40px"><h2 id="card-title">Card</h2><input id="input" value="Editable"><button id="button">Action</button><a id="link" href="#">Link</a></div><div id="target" style="padding:40px;min-height:100px"></div></article>`
 await reset(value);await select('#card')
 const before=await html()
 for(const selector of ['#input','#button','#link']){
  const from=center(await box(selector));await drag(from,{x:from.x+40,y:from.y+40},false)
  assert.equal(await page.locator('[data-arrange-ghost]').count(),0);await page.mouse.up();await tick()
  assert.equal(await html(),before);await select('#card')
 }
 await drag(center(await box('#card-title')),center(await box('#target')))
 assert.equal(await page.locator('#target > #card > #card-title').count(),1);await undo(before)
})
await reset()
await check('keyboard activation of the handle arms Move and Escape disarms it without editing',async()=>{
 const before=await html();await select('#image');await button('Drag to reposition component').focus();await page.keyboard.press('Enter')
 assert.equal(await button('Drag to reposition component').getAttribute('aria-pressed'),'true')
 await page.keyboard.press('Escape');assert.equal(await button('Drag to reposition component').getAttribute('aria-pressed'),'false')
 assert.equal(await html(),before)
})
await reset()
await check('Move handle fits inside the wrapped toolbar without obscuring resize corners',async()=>{
 await page.setViewportSize({width:390,height:1050});await tick();await select('#aside')
 const handle=await button('Drag to reposition component').boundingBox(),toolbar=await page.getByRole('toolbar',{name:'Quick layout controls'}).boundingBox()
 assert.ok(handle.y>=toolbar.y&&handle.y+handle.height<=toolbar.y+toolbar.height,'handle stays in the wrapped toolbar')
 assert.ok(handle.x>=0&&handle.x+handle.width<=390)
 for(const corner of await page.getByRole('button',{name:'Drag to resize width',exact:true}).all()){
  const b=await corner.boundingBox();assert.ok(b.x+b.width<=handle.x||b.x>=handle.x+handle.width||b.y+b.height<=handle.y||b.y>=handle.y+handle.height)
 }
 await page.screenshot({path:'.context/responsive-smart-move-mobile.png'})
 await page.setViewportSize({width:1300,height:1050});await tick()
})
await check('automatic routing recognizes decorated and media divs but leaves generic wrappers and child content alone',async()=>{
 const result=await page.evaluate(async()=>{
  const {prefersComponentMove}=await import('/src/components/app/screens/pipeline/editor/responsive/useDragRouting.ts')
  const cases=['<aside>Note</aside>','<figure><img></figure>','<div><img><p>Caption</p></div>','<div data-responsive-container><p>Object</p></div>','<div style="background:#eee"><p>Card</p></div>','<div style="border:1px solid"><p>Card</p></div>','<div style="float:right">Note</div>','<header>Title</header>','<div><p>Plain</p></div>','<img>','<p>Text</p>']
  return cases.map(html=>{const root=document.createElement('div');root.innerHTML=html;document.body.append(root);const result=prefersComponentMove(root.firstElementChild);root.remove();return result})
 })
 assert.deepEqual(result,[...Array(8).fill(true),false,false,false])
})
const endpoint=`${origin}/api/books/C-98-Weather-and-Climate---textbook/pages/pg013`
const stored=await (await page.request.get(endpoint)).json()
await reset(stored.rendering.sections[0].html)
await check('weather page 13 aside drags directly into text flow and saved rendering remains unchanged',async()=>{
 const before=await html();await select('.adt-canvas aside')
 const source=await box('.adt-canvas aside')
 const target=await page.locator('[data-id="pg013_n0008"]').evaluate(el=>el.closest('p').getBoundingClientRect().toJSON())
 const side=await page.locator('.adt-canvas aside').evaluate(el=>getComputedStyle(el).float==='right'?'left':'right')
 await drag(center(source),{x:target.x+target.width*(side==='right'?.9:.1),y:target.y+target.height*.5},false)
 assert.match(await page.getByRole('status').innerText(),new RegExp(`Wrap text.*${side}`))
 await page.screenshot({path:'.context/responsive-smart-move-weather.png'})
 await page.mouse.up();await tick()
 assert.equal(await page.locator('.adt-canvas aside').evaluate(el=>getComputedStyle(el).float),side)
 await undo(before)
 assert.deepEqual(await (await page.request.get(endpoint)).json(),stored)
})
await check('weather page 12 uses one Move control for dragging and click activation',async()=>{
 const endpoint=`${origin}/api/books/C-98-Weather-and-Climate---textbook/pages/pg012`
 const stored=await (await page.request.get(endpoint)).json()
 await reset(stored.rendering.sections[0].html);await select('.adt-canvas aside h3')
 const before=await html(),handle=button('Drag to reposition component')
 assert.equal(await page.locator('[data-component-move-handle]').count(),1)
 assert.match(await handle.innerText(),/Reposition\s+aside/)
 await handle.click();assert.equal(await handle.getAttribute('aria-pressed'),'true')
 assert.equal(await html(),before);assert.equal(await button('Undo').isDisabled(),true)
 await handle.click();assert.equal(await handle.getAttribute('aria-pressed'),'false')
 await handle.hover();await tick()
 const toolbar=await page.getByRole('toolbar',{name:'Quick layout controls'}).boundingBox(),component=await box('.adt-canvas aside')
 const x=Math.max(0,Math.min(toolbar.x,component.x)-16),y=Math.max(0,toolbar.y-24)
 await page.screenshot({path:'.context/responsive-move-menu-weather.png',clip:{x,y,width:1300-x,height:Math.min(1050-y,component.y+component.height-y+24)}})
 assert.deepEqual(await (await page.request.get(endpoint)).json(),stored)
})
assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
await browser.close();console.log(`${passed} smart Move checks passed; no book writes`)
