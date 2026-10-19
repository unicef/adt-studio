import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'

const origin = process.env.STUDIO_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({headless:true})
const page = await browser.newPage({viewport:{width:1240,height:1000}})
const errors=[], writes=[]
page.on('pageerror', e => {errors.push(e.message); console.error(e.message)})
page.on('request', r => {if(r.url().includes('/api/books/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.url())})
const button=name=>page.getByRole('button',{name,exact:true})
const tick=()=>page.waitForTimeout(180)
const html=()=>page.evaluate(()=>window.fixtureEditor.getHtml())
const box=selector=>page.locator(selector).boundingBox()
const center=b=>({x:b.x+b.width/2,y:b.y+b.height/2})
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1,`${actual} != ${expected}`)
let passed=0
async function check(name,run){await run();passed++;console.log('PASS',name)}
async function select(selector){await page.evaluate(selector=>window.fixtureEditor.select(document.querySelector(selector).dataset.adtId),selector);await tick()}
async function reset(value){await page.evaluate(value=>window.fixtureEditor.replaceDocument(value),value);await tick()}
async function activate(){await button('Free transform').click();await tick()}
async function drag(selector,dx,dy,finish=true){const from=center(await box(selector));await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+dx,from.y+dy,{steps:8});await tick();if(finish){await page.mouse.up();await tick()}}
const field=axis=>page.locator('[data-responsive-position]').getByRole('spinbutton',{name:axis,exact:true})
async function set(axis,value){await field(axis).fill(String(value));await field(axis).press('Enter');await tick()}
const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#b7d4c7"/></svg>')
const fixture=`<article id="page" style="padding:80px 32px 32px;max-width:1000px;margin:auto"><header id="banner" style="display:flex;align-items:center;justify-content:space-between;padding:24px;background:#e7efe8;height:240px"><h1 id="title" style="font-size:32px;width:55%">Water in the atmosphere</h1><div id="badge" style="display:flex;align-items:center;justify-content:center;width:150px;height:150px;border-radius:50%;background:#4e9657;color:white"><p id="label" style="font-size:24px">Chapter 2</p></div></header><p id="body" style="margin-top:24px">Water vapor rises from oceans and lakes and forms clouds in the atmosphere.</p><figure id="figure" style="width:60%;margin-top:24px;background:#f0f5f2;padding:12px"><img id="image" src="${art}" style="width:50%;display:block"><figcaption id="caption">Evaporation</figcaption></figure><p id="end" style="margin-top:32px">End of section</p></article>`

try {
 await page.goto(`${origin}/responsive-playground.html`);await page.locator('#demo-image').waitFor()
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
  const {StyleInspection}=await import('/src/components/app/screens/pipeline/editor/responsive/inspection/StyleInspection.tsx')
  const {PositionProvider}=await import(resources.find(url=>new URL(url).pathname.endsWith('/position/PositionProvider.tsx')))
  const {StylesPanel}=await import('/src/components/app/screens/pipeline/panel/StylesPanel.tsx')
  function Capture(){window.fixtureEditor=useEditor();window.fixtureSelection=useSelectedIds();return null}
  document.querySelector('#root').remove()
  const host=document.createElement('div');document.body.append(host)
  const h=React.createElement
  function App(){
   const [value,onChange]=React.useState('<p>Fixture</p>'),[direct,setDirect]=React.useState(true),[panel,setPanel]=React.useState(true)
   window.fixtureDirect=setDirect;window.fixturePanel=setPanel
   return h(I18nProvider,{i18n},h(HtmlEditor,{value,onChange,layout:'flow',className:'flex h-dvh'},h(StyleInspection,null,h(PositionProvider,null,h(Capture),
    h(HtmlEditor.Canvas,{className:'min-w-0 flex-1'},h(HtmlEditor.Canvas.Toolbar,null,h(HtmlEditor.History)),direct?h(ResponsiveCanvas):h(HtmlEditor.Canvas.Viewport)),
    panel&&h('aside',{className:'flex w-80 shrink-0 border-l'},h(StylesPanel,{editable:true}))))))
  }
  createRoot(host).render(h(App))
 })
 await page.locator('.adt-canvas p').waitFor()
 await reset(fixture);await select('#label')
 await check('Position follows Spacing and Reposition replaces Move',async()=>{
  assert.match(await button('Drag to reposition component').innerText(),/Reposition/)
  assert.equal(await button('Drag to move component').count(),0)
  assert.equal(await field('X').inputValue(),'0');assert.equal(await field('Y').inputValue(),'0')
  assert.ok(await page.locator('[data-responsive-position]').evaluate(el=>el.previousElementSibling.textContent.includes('Spacing')))
 })
 await check('free dragging shifts the exact label, updates offsets live, and commits once',async()=>{
  const before=await html(),start=await box('#label'),badge=await box('#badge'),body=await box('#body')
  await activate();assert.equal(await html(),before)
  await drag('#label',-42,26,false)
  assert.equal(await html(),before);close((await box('#label')).x,start.x-42);close((await box('#label')).y,start.y+26)
  close((await box('#badge')).x,badge.x);close((await box('#body')).y,body.y)
  assert.equal(await field('X').inputValue(),'-42');assert.equal(await field('Y').inputValue(),'26')
  assert.match(await page.getByRole('tooltip',{name:'Changing styles'}).innerText(),/translate/)
  assert.equal(await page.locator('[data-arrange-ghost]').count(),0)
  await page.mouse.up();await tick()
  const after=await html();assert.notEqual(after,before);assert.doesNotMatch(after,/touch-action|cursor:|data-transform/)
  assert.equal(await page.evaluate(()=>window.fixtureSelection[0]===document.querySelector('#label').dataset.adtId),true)
  await button('Undo').click();await tick();assert.equal(await html(),before)
  await button('Redo').click();await tick();assert.equal(await html(),after)
  await page.screenshot({path:'.context/responsive-position-prototype.png'})
  await page.keyboard.press('Escape');await tick()
 })
 await reset(fixture);await select('#badge')
 await check('numeric offsets and Escape edits are precise without changing margins or size',async()=>{
  const start=await box('#badge')
  await set('X',-25);await set('Y',12.5)
  close((await box('#badge')).x,start.x-25);close((await box('#badge')).y,start.y+12.5)
  const before=await html()
  await field('X').fill('88');await field('X').press('Escape');await tick();assert.equal(await html(),before)
  assert.equal(await field('X').inputValue(),'-25')
  await field('X').fill('10001');await field('X').press('Enter');await tick();assert.equal(await html(),before)
  close((await box('#badge')).width,start.width)
 })
 await check('arrows nudge 1px and Shift nudges 10px without reordering',async()=>{
  await activate();await page.keyboard.press('ArrowRight');await tick();await page.keyboard.press('Shift+ArrowUp');await tick()
  assert.equal(await field('X').inputValue(),'-24');assert.equal(await field('Y').inputValue(),'2.5')
  assert.equal(await page.locator('#banner > #badge > #label').count(),1)
  const before=await html();await field('X').focus();await field('X').press('ArrowUp');assert.equal(await html(),before)
  await field('X').press('Escape');await page.keyboard.press('Escape');await tick()
 })
 await check('Reset clears offsets and is undoable',async()=>{
  const before=await html();await button('Reset offsets').click();await tick()
  assert.equal(await field('X').inputValue(),'0');assert.equal(await field('Y').inputValue(),'0')
  await button('Undo').click();await tick();assert.equal(await html(),before)
 })
 for(const kind of ['Escape','pointercancel','blur','selection','document','lock','direct']){
  await reset(fixture);await select('#badge');await activate()
  await check(`${kind} cancels a live transform without persisting preview`,async()=>{
   const before=await html();await drag('#badge',-60,34,false)
   if(kind==='Escape')await page.keyboard.press('Escape')
   if(kind==='pointercancel')await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})))
   if(kind==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')))
   if(kind==='selection')await select('#body')
   if(kind==='document')await reset('<p id="replacement">Replacement page</p>')
   if(kind==='lock')await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#badge').dataset.adtId,true))
   if(kind==='direct')await page.evaluate(()=>window.fixtureDirect(false))
   await page.mouse.up();await tick()
   if(kind!=='document')assert.equal(await html(),before)
   else assert.match(await html(),/Replacement page/)
   assert.equal(await page.getByRole('tooltip',{name:'Changing styles'}).count(),0)
   if(kind==='direct'){assert.equal(await button('Free transform').isDisabled(),true);await page.evaluate(()=>window.fixtureDirect(true));await tick()}
  })
 }
 await reset(fixture);await select('#image')
 await check('a selected image offsets independently while a selected figure carries its caption',async()=>{
  const caption=await box('#caption');await activate();await drag('#image',40,20)
  close((await box('#caption')).x,caption.x);close((await box('#caption')).y,caption.y)
  await page.keyboard.press('Escape');await select('#figure');await activate();await drag('#image',-18,30)
  close((await box('#caption')).x,caption.x-18);close((await box('#caption')).y,caption.y+30)
  await page.keyboard.press('Escape')
 })
 await reset(fixture.replace('font-size:24px','font-size:24px;transform:rotate(12deg) scale(.9);translate:25% 10%'));await select('#label')
 await check('authored rotation/scale and percentage translation survive repeated drags and narrower viewports',async()=>{
  const original=await page.locator('#label').evaluate(el=>({transform:el.style.transform,width:el.offsetWidth,height:el.offsetHeight}))
  await activate();await drag('#label',-30,12);await drag('#label',-10,8)
  assert.equal(await page.locator('#label').evaluate(el=>el.style.transform),original.transform)
  assert.match(await page.locator('#label').evaluate(el=>el.style.translate),/25%/)
  close(Number(await field('X').inputValue()),original.width*.25-40)
  await page.keyboard.press('Escape');await page.setViewportSize({width:1000,height:1000});await tick()
  close(Number(await field('X').inputValue()),await page.locator('#label').evaluate(el=>el.offsetWidth*.25-40))
  await button('Reset offsets').click();await tick()
  assert.equal(await page.locator('#label').evaluate(el=>el.style.transform),original.transform)
  await page.setViewportSize({width:1240,height:1000});await tick()
 })
 await reset(fixture.replace('height:240px','height:240px;transform:scale(.8);transform-origin:top left'));await select('#label')
 await check('scaled ancestors convert pointer distance to CSS offsets',async()=>{
  const start=await box('#label');await activate();await drag('#label',-40,24)
  close((await box('#label')).x,start.x-40);close((await box('#label')).y,start.y+24)
  close(Number(await field('X').inputValue()),-50);close(Number(await field('Y').inputValue()),30)
  await page.keyboard.press('Escape')
 })
 await check('locked descendants, inline text, positioned boxes and rotated ancestors explain restrictions',async()=>{
  await reset(fixture);await select('#badge')
  await page.evaluate(()=>window.fixtureEditor.setLocked(document.querySelector('#label').dataset.adtId,true));await tick()
  assert.equal(await button('Free transform').isDisabled(),true);assert.match(await page.locator('[data-responsive-position]').innerText(),/Unlock/)
  await reset(fixture.replace('Chapter 2','<span id="inline">Chapter 2</span>'));await select('#inline')
  assert.equal(await button('Free transform').isDisabled(),true);assert.match(await page.locator('[data-responsive-position]').innerText(),/wrap a container/)
  await reset(fixture.replace('font-size:24px','font-size:24px;position:absolute'));await select('#label')
  assert.equal(await button('Free transform').isDisabled(),true)
  await reset(fixture.replace('height:240px','height:240px;transform:rotate(3deg)'));await select('#label')
  assert.equal(await button('Free transform').isDisabled(),true);assert.match(await page.locator('[data-responsive-position]').innerText(),/outer container/)
 })
 await reset(fixture);await select('#label')
 await check('a higher-priority translate rule reports a blocked offset without changing HTML',async()=>{
  const sheet=await page.addStyleTag({content:'#label { translate: 5px 3px !important }'});await tick()
  const before=await html();await set('X',30)
  assert.equal(await html(),before);assert.equal(await field('X').inputValue(),'5')
  assert.match(await page.locator('[data-responsive-position]').innerText(),/existing style is preventing/)
  await activate();await drag('#label',30,20)
  assert.equal(await html(),before);assert.equal(await page.locator('[data-transform-origin]').count(),0)
  await page.keyboard.press('Escape');await sheet.evaluate(el=>el.remove());await tick()
 })
 await reset(fixture.replace('font-size:24px','font-size:24px;translate:5px 3px !important'));await select('#label')
 await check('authored inline priority survives offsets and Reset',async()=>{
  await activate();await drag('#label',20,12)
  assert.equal(await field('X').inputValue(),'25');assert.equal(await field('Y').inputValue(),'15')
  assert.equal(await page.locator('#label').evaluate(el=>el.style.getPropertyPriority('translate')),'important')
  await page.keyboard.press('Escape');await button('Reset offsets').click();await tick()
  assert.equal(await field('X').inputValue(),'0')
  assert.equal(await page.locator('#label').evaluate(el=>el.style.getPropertyPriority('translate')),'important')
 })
 await reset(fixture);await select('#badge')
 await check('entering Free transform leaves Reposition mode and restores it as a separate action',async()=>{
  await button('Drag to reposition component').click();await activate();await drag('#badge',-15,15)
  assert.equal(await page.locator('[data-arrange-ghost]').count(),0)
  await page.keyboard.press('Escape');await tick()
  assert.equal(await button('Drag to reposition component').getAttribute('aria-pressed'),'false')
 })
 await reset(fixture);await select('#label')
 await check('selection/page changes and sidebar remounts show the current offsets',async()=>{
  await set('X',-30);await select('#title');assert.equal(await field('X').inputValue(),'0')
  await select('#label');assert.equal(await field('X').inputValue(),'-30')
  await page.evaluate(()=>window.fixturePanel(false));await tick();await page.evaluate(()=>window.fixturePanel(true));await tick()
  assert.equal(await field('X').inputValue(),'-30')
  await reset(fixture);await select('#label');assert.equal(await field('X').inputValue(),'0')
 })
 await check('weather chapter label can be offset on a read-only page-11 copy',async()=>{
  const url=`${origin}/api/books/C-98-Weather-and-Climate---textbook/pages/pg011`
  const response=await page.request.get(url);assert.ok(response.ok());const book=await response.json()
  const original=book.rendering.sections[0].html
  await reset(original);await page.waitForTimeout(1200)
  const selector=await page.locator('.adt-canvas').evaluate(root=>{
   const el=[...root.querySelectorAll('p,h1,h2,h3,div')].find(el=>el.textContent.trim()==='Chapter 2'&&el.children.length===0)
   return el ? `[data-adt-id="${el.dataset.adtId}"]` : null
  })
  assert.ok(selector);await select(`.adt-canvas ${selector}`);assert.equal(await button('Free transform').isDisabled(),false)
  await activate();const start=await box(`.adt-canvas ${selector}`);await drag(`.adt-canvas ${selector}`,-20,12)
  close((await box(`.adt-canvas ${selector}`)).x,start.x-20);close((await box(`.adt-canvas ${selector}`)).y,start.y+12)
  await page.screenshot({path:'.context/responsive-position-weather.png'})
  await button('Undo').click();await tick()
  assert.deepEqual(await (await page.request.get(url)).json(),book)
 })
 await check('the real Storyboard exposes Position and can enter/exit the mode without edits',async()=>{
  await page.goto(`${origin}/pipeline/C-98-Weather-and-Climate---textbook/pages/pg011`)
  await page.locator('.adt-canvas h1').first().waitFor()
  await page.evaluate(async()=>{
   const url=performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname.endsWith('/deps/react-scan.js'))
   if(url)(await import(url)).setOptions({enabled:false,showToolbar:false})
  })
  if(await button('Show the panel').isVisible())await button('Show the panel').click()
  await page.getByRole('tab',{name:'Styles',exact:true}).click()
  await page.locator('.adt-canvas h1').filter({hasText:'Chapter 2'}).click();await tick()
  assert.equal(await button('Free transform').isDisabled(),false)
  await activate();assert.equal(await page.locator('[data-responsive-transform]').count(),1)
  await page.keyboard.press('Escape');await tick();assert.equal(await page.locator('[data-responsive-transform]').count(),0)
  assert.equal(await button('Undo').isDisabled(),true)
 })
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 console.log(`${passed} position browser checks passed; no book writes`)
} finally {await browser.close()}
