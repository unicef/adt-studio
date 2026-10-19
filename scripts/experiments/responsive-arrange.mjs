import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'
// Exercises the actual adapter with in-memory fixtures. No book writes or AI calls.
const browser = await chromium.launch({headless:true})
const page = await browser.newPage({viewport:{width:1440,height:1050}})
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
const button=name=>page.getByRole('button',{name,exact:true})
const tick=()=>page.waitForTimeout(120)
let passed=0
async function check(name,run){await run(); console.log('PASS',name); passed++}
await page.goto(`${process.env.STUDIO_URL ?? 'http://localhost:5173'}/responsive-playground.html`)
await page.getByRole('combobox',{name:'Image structure'}).selectOption('components')
await page.locator('#demo-image').click()
await tick()
await check('playground exposes component actions and an intact figure drag',async()=>{
 await button('Component layout').click()
 assert.equal(await button('One below another').isEnabled(),true)
 await page.waitForTimeout(250); await page.screenshot({path:'.context/responsive-component-menu.png',animations:'disabled'})
 await page.keyboard.press('Escape')
 await button('Drag to reposition component').click(); await tick()
 const a=await page.locator('#demo-image').boundingBox(),b=await page.locator('#second-image').boundingBox()
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2); await page.mouse.down()
 await page.mouse.move(b.x+b.width*.8,b.y+b.height/2,{steps:10}); await tick()
 assert.equal(await page.getByRole('status').innerText(),'Place after')
 await page.screenshot({path:'.context/responsive-arrange-preview.png'})
 await page.mouse.up(); await tick()
 assert.deepEqual(await page.locator('#demo-columns > figure').evaluateAll(els=>els.map(el=>el.id)),['second-figure','first-figure'])
 assert.equal(await page.locator('#first-figure figcaption').innerText(),'A nested layout')
 await button('Undo').click(); await tick()
 assert.deepEqual(await page.locator('#demo-columns > figure').evaluateAll(els=>els.map(el=>el.id)),['first-figure','second-figure'])
})
// Public editor API for selecting precise fixtures, resetting, and asserting serialization.
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
const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="lightblue"/></svg>')
const figure=(id)=>`<figure id="${id}" class="flex flex-col gap-2" style="padding:12px;background:#e7efe8"><img id="${id}-image" src="${art}" style="width:100%;height:auto"><figcaption data-id="${id}-caption">Caption ${id}</figcaption></figure>`
const fixture=`<article id="article" style="max-width:1000px;padding:24px;margin:auto"><aside id="aside" class="lg:float-right w-1/3 ml-6 mb-4 max-lg:float-none max-lg:w-full max-lg:ml-0" style="padding:16px;background:#fef3c7"><h2>Vocabulary</h2><p id="aside-copy">A floating component.</p></aside><p id="intro" style="margin-bottom:24px">Weather and climate: this paragraph flows around the aside.</p><div id="pair" class="grid grid-cols-2 max-lg:grid-cols-1 gap-6 clear-both">${figure('one')}${figure('two')}</div><div id="empty" style="min-height:100px;padding:24px;margin-top:24px;background:#eee"></div><p id="end" style="margin-top:24px">End of section.</p></article>`
const html=()=>page.evaluate(()=>window.fixtureEditor.getHtml())
async function reset(value=fixture){await page.evaluate(value=>window.fixtureEditor.replaceDocument(value),value); await tick()}
async function select(selector){await page.evaluate(selector=>window.fixtureEditor.select(document.querySelector(selector).dataset.adtId),selector);await tick()}
async function action(name){await button('Component layout').click();await button(name).click();await tick()}
async function arrange(source,target,{x=.5,y=.5,finish=true}={}){
 await select(source);await button('Drag to reposition component').click(); await tick()
 const a=await page.locator(source).boundingBox(),b=await page.locator(target).boundingBox()
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2); await page.mouse.down()
 await page.mouse.move(b.x+b.width*x,b.y+b.height*y,{steps:12});await tick()
 if(finish){await page.mouse.up();await tick()}
}
await reset()
await check('float action from a child preserves content, mirrors margins, stacks on mobile and undoes once',async()=>{
 const before=await html(),content=await page.locator('#aside').innerHTML()
 await select('#aside-copy');await action('Wrap text · object on left')
 assert.equal(await page.locator('#aside').evaluate(el=>getComputedStyle(el).float),'left')
 assert.equal(await page.locator('#aside').evaluate(el=>getComputedStyle(el).marginRight),'24px')
 assert.equal(await page.locator('#aside').innerHTML(),content)
 await page.setViewportSize({width:390,height:1050});await tick()
 assert.deepEqual(await page.locator('#aside').evaluate(el=>[getComputedStyle(el).float,getComputedStyle(el).marginRight]),['none','0px'])
 await button('Undo').click();assert.equal(await html(),before)
 await page.setViewportSize({width:1440,height:1050});await tick()
})
await reset()
await check('column presets align offset children, preserve captions, stack on mobile and undo once',async()=>{
 await page.evaluate(()=>{const e=window.fixtureEditor,id=document.querySelector('#two').dataset.adtId;e.setClasses(id,['-ml-8','w-2/3']);e.placeNode(id,{style:'margin-top:40px;width:60%'})})
 await tick();const before=await html()
 await select('#pair');await action('Side by side · equal columns')
 const dims=await page.locator('#pair').evaluate(el=>[...el.children].map(c=>({top:c.getBoundingClientRect().top,width:c.getBoundingClientRect().width})))
 assert.ok(Math.abs(dims[0].top-dims[1].top)<1);assert.ok(Math.abs(dims[0].width-dims[1].width)<1)
 assert.equal(await page.locator('#pair figcaption').count(),2)
 await page.setViewportSize({width:390,height:1050});await tick()
 assert.equal(await page.locator('#pair').evaluate(el=>el.children[1].getBoundingClientRect().top>=el.children[0].getBoundingClientRect().bottom),true)
 assert.equal(await page.locator('.adt-canvas').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
 await button('Undo').click();assert.equal(await html(),before)
 await page.setViewportSize({width:1440,height:1050});await tick()
})
await reset()
await check('stack and swap actions retain whole components and each has one undo',async()=>{
 const before=await html();await select('#pair');await action('One below another')
 assert.equal(await page.locator('#two').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('#one').getBoundingClientRect().bottom),true)
 await button('Undo').click();assert.equal(await html(),before)
 await select('#pair');await action('Switch order')
 assert.equal(await page.locator('#pair > :first-child').getAttribute('id'),'two')
 await button('Undo').click();assert.equal(await html(),before)
})
await reset()
await check('Arrange moves a figure and caption into a different container, with atomic undo/redo',async()=>{
 const before=await html(),content=await page.locator('#one').innerHTML()
 await arrange('#one-image','#empty')
 assert.equal(await page.locator('#empty > #one').count(),1)
 assert.equal(await page.locator('#one').innerHTML(),content)
 await button('Undo').click();assert.equal(await html(),before)
 await button('Redo').click();assert.equal(await page.locator('#empty > #one').count(),1)
})
await reset()
await check('dropping a figure beside prose wraps text without losing IDs or captions',async()=>{
 const before=await html()
 await arrange('#one-image','#end',{x:.08,y:.5})
 assert.equal(await page.locator('#one').evaluate(el=>el.parentElement.children[1]?.id),'end')
 assert.equal(await page.locator('#one').evaluate(el=>getComputedStyle(el.parentElement).display),'flow-root')
 assert.equal(await page.locator('[data-id="one-caption"]').count(),1)
 assert.doesNotMatch(await html(),/data-arrange|data-adt-id|position:\s*absolute|transform:/)
 await page.setViewportSize({width:390,height:1050});await tick()
 assert.equal(await page.locator('#end').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('#one').getBoundingClientRect().bottom),true)
 await button('Undo').click();assert.equal(await html(),before)
 await page.setViewportSize({width:1440,height:1050});await tick()
})
await reset()
await check('Arrange reorders outside a column group and preserves component content',async()=>{
 const before=await html()
 await arrange('#one-image','#end',{x:.5,y:.95})
 assert.equal(await page.locator('#one').evaluate(el=>el.previousElementSibling.id),'end')
 assert.equal(await page.locator('#one figcaption').textContent(),'Caption one')
 await button('Undo').click();assert.equal(await html(),before)
})
for(const cancellation of ['Escape','pointercancel','reset']){
 await reset()
 await check(`${cancellation} cancels Arrange without a mutation or history entry`,async()=>{
  const before=await html()
  await arrange('#one-image','#empty',{finish:false})
  assert.equal(await page.locator('[data-arrange-ghost]').count(),1)
  if(cancellation==='Escape')await page.keyboard.press('Escape')
  else if(cancellation==='pointercancel')await page.dispatchEvent('#one-image','pointercancel',{pointerId:1})
  else await reset()
  await page.mouse.up();await tick()
  assert.equal(await html(),before);assert.equal(await button('Undo').isDisabled(),true)
  assert.equal(await page.locator('[data-arrange-ghost]').count(),0)
 })
}
await reset()
await check('Escape disarms Arrange before a gesture starts',async()=>{
 await select('#one-image');await button('Drag to reposition component').click();await tick()
 assert.equal(await button('Drag to reposition component').getAttribute('aria-pressed'),'true')
 await page.keyboard.press('Escape');assert.equal(await button('Drag to reposition component').getAttribute('aria-pressed'),'false')
})
await reset()
await check('locked destinations and descendant cycles cannot be dropped into',async()=>{
 await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#empty').dataset.adtId,true));await tick()
 const before=await html();await arrange('#one-image','#empty');assert.equal(await html(),before)
 await arrange('#pair','#one-image');assert.equal(await html(),before)
 assert.equal(await button('Undo').isDisabled(),true)
 await arrange('#one-image','#end',{y:.95})
 assert.equal(await page.locator('#one').evaluate(el=>el.previousElementSibling.id),'end')
})
await reset(`<article id="article" style="padding:24px"><div id="diagram" style="position:relative;width:240px"><img id="diagram-image" src="${art}"><span id="label" style="position:absolute;top:12px">Label</span></div><p id="end" style="margin-top:50px">After diagram</p></article>`)
await check('diagram image moves with its absolutely positioned labels',async()=>{
 const before=await html();await arrange('#diagram-image','#end',{y:.95})
 assert.equal(await page.locator('#diagram').evaluate(el=>el.previousElementSibling.id),'end')
 assert.equal(await page.locator('#diagram #label').count(),1)
 await button('Undo').click();assert.equal(await html(),before)
})
await check('unsupported positioning, ordered grids, inline prose and tables reject component movement',async()=>{
 const actual=await page.evaluate(async()=>{
  const {movableComponent}=await import('/src/components/app/screens/pipeline/editor/responsive/componentLayout.ts')
  const cases=[['<div style="transform:rotate(4deg)"><p data-adt-id="x">Text</p></div>','p'],['<div data-adt-id="x" style="position:absolute">Absolute</div>','div'],['<div style="display:grid"><div data-adt-id="x" style="grid-column:2">Placed</div></div>','[data-adt-id]'],['<p>Sentence <span data-adt-id="x">inline</span></p>','span'],['<table><tbody><tr><td data-adt-id="x">Cell</td></tr></tbody></table>','td'],['<p>Before <img data-adt-id="x"> after</p>','img'],['<a href="#"><img data-adt-id="x"></a>','img']]
  return cases.map(([html,selector])=>{const root=document.createElement('div');root.innerHTML=html;document.body.append(root);const allowed=movableComponent(root.querySelector(selector));root.remove();return allowed})
 })
 assert.deepEqual(actual,Array(7).fill(false))
})
assert.deepEqual(errors,[])
await browser.close()
console.log(`${passed} component browser checks passed; no page errors`)
