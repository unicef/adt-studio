import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'

const origin=process.env.STUDIO_URL ?? 'http://localhost:5173'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1240,height:1000}})
page.setDefaultTimeout(15000)
const errors=[],writes=[]
page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
page.on('request',r=>{if(r.url().includes('/api/books/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.url())})
const button=name=>page.getByRole('button',{name,exact:true})
const tick=()=>page.waitForTimeout(180)
const html=()=>page.evaluate(()=>window.fixtureEditor.getHtml())
const sidebar=()=>page.getByRole('complementary',{name:'Styles',exact:true})
const toolbar=()=>page.getByRole('toolbar',{name:'Quick layout controls'})
const picker=(where='toolbar')=>(where==='sidebar'?sidebar():toolbar()).getByRole('combobox',{name:'Change HTML tag',exact:true})
const option=tag=>page.getByRole('option').filter({has:page.locator('span').filter({hasText:new RegExp(`^${tag}$`)})})
async function select(selector){await page.evaluate(selector=>window.fixtureEditor.select(document.querySelector(selector).dataset.adtId),selector);await tick()}
async function reset(value){await page.evaluate(value=>window.fixtureEditor.replaceDocument(value),value);await tick()}
async function retag(tag,where='toolbar'){await picker(where).click();await option(tag).click();await tick()}
async function undo(before){await button('Undo').click();await tick();assert.equal(await html(),before)}
let passed=0
async function check(name,run){if(process.env.TAG_CHECK&&!name.includes(process.env.TAG_CHECK))return;await run();passed++;console.log('PASS',name)}
const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"><rect width="30" height="20" fill="green"/></svg>')
const fixture=`<article id="page" style="padding:90px 32px;max-width:850px;margin:auto"><p id="before">Before</p><h2 id="target" data-id="pg011_n0004" lang="en" aria-describedby="after" class="adt-h2 text-emerald-700 font-bold" style="font-size:24px!important;margin:20px 0;translate:12px 3px">Water <em id="em">in the atmosphere</em> <a id="link" href="#after">learn more</a><!--retain--><img id="image" src="${art}" alt="Sample" style="display:inline-block;width:30px;height:20px"></h2><p id="after">After</p></article>`
try {
 await page.goto(`${origin}/responsive-playground.html`);await page.locator('#demo-image').waitFor()
 await page.evaluate(async()=>{
  const resources=performance.getEntriesByType('resource').map(e=>e.name)
  const module=name=>resources.find(url=>new URL(url).pathname.endsWith(`/deps/${name}.js`))
  const React=(await import(module('react'))).default
  const {createRoot}=(await import(module('react-dom_client'))).default
  const {HtmlEditor}=await import(module('adt-html-editor_shadcn'))
  const {useEditor,useSelectedIds,useEditorStoreApi}=await import(module('adt-html-editor'))
  const {I18nProvider}=await import(module('@lingui_react'))
  const {i18n}=await import(module('@lingui_core'))
  const {ResponsiveCanvas}=await import('/src/components/app/screens/pipeline/editor/responsive/ResponsiveCanvas.tsx')
  const {StyleInspection}=await import('/src/components/app/screens/pipeline/editor/responsive/inspection/StyleInspection.tsx')
  const {PositionProvider}=await import(resources.find(url=>new URL(url).pathname.endsWith('/position/PositionProvider.tsx')))
  const {StylesPanel}=await import('/src/components/app/screens/pipeline/panel/StylesPanel.tsx')
  function Capture(){window.fixtureEditor=useEditor();window.fixtureSelection=useSelectedIds();window.fixtureStore=useEditorStoreApi();return null}
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
 await page.evaluate(async()=>{window.retagTools=await import('/src/components/app/screens/pipeline/editor/responsive/tags/retag.ts')})
 const state=()=>page.evaluate(()=>{
  const id=window.fixtureSelection[0],doc=window.fixtureStore.state.doc,node=doc.nodes[id]
  return {id,node,children:node.children.map(id=>doc.nodes[id]),history:window.fixtureStore.state.history.past.length}
 })
 await reset(fixture);await select('#target')
 await check('toolbar changes h2 to p while retaining content, IDs, attributes, class order and styles',async()=>{
  const before=await html(),initial=await state(),content=await page.locator('#target').innerHTML()
  await retag('p')
  const after=await state()
  assert.equal(await page.locator('p#target').count(),1)
  assert.deepEqual(after.node.attrs,initial.node.attrs);assert.deepEqual(after.node.classes,initial.node.classes)
  assert.deepEqual(after.node.children,initial.node.children)
  assert.deepEqual(after.children.map(({parentId,...node})=>node),initial.children.map(({parentId,...node})=>node))
  assert.equal(await page.locator('#target').innerHTML(),content)
  assert.equal(after.history,1);assert.equal(await picker('sidebar').innerText(),'p')
  assert.deepEqual(await page.locator('#page').evaluate(el=>[...el.children].map(el=>el.id)),['before','target','after'])
  const saved=await html();await undo(before);await button('Redo').click();await tick();assert.equal(await html(),saved)
  assert.equal(await page.locator('#target').getAttribute('data-adt-id'),after.id)
 })
 await check('sidebar tag control changes heading levels and keeps prior history',async()=>{
  await page.evaluate(()=>window.fixtureEditor.setAttr(window.fixtureSelection[0],'title','Retain this note'));await tick()
  const before=await html();await retag('h3','sidebar')
  assert.equal(await page.locator('h3#target[title="Retain this note"]').count(),1)
  assert.equal(await picker().innerText(),'h3')
  await undo(before)
  await button('Undo').click();await tick();assert.equal(await page.locator('#target').getAttribute('title'),null)
 })
 await reset('<article style="padding:90px 32px"><div id="target"><p>First paragraph</p><p>Second paragraph</p></div></article>');await select('#target')
 await check('containers retain their children and incompatible text tags are disabled',async()=>{
  const before=await html();await picker().click()
  for(const tag of ['p','h1','h2','span'])assert.equal(await option(tag).getAttribute('aria-disabled'),'true')
  await option('aside').click();await tick()
  assert.equal(await page.locator('aside#target > p').count(),2)
  assert.equal(await page.evaluate(()=>window.retagTools.retagElement(window.fixtureStore,window.fixtureSelection[0],'p')),null)
  await undo(before)
 })
 await reset('<article style="padding:90px 32px"><p id="para">Before <span id="target">inline label</span> after</p></article>');await select('#target')
 await check('inline text cannot become a block inside a sentence',async()=>{
  const before=await html()
  assert.equal(await picker('sidebar').isDisabled(),true)
  assert.equal(await page.evaluate(()=>window.retagTools.retagElement(window.fixtureStore,window.fixtureSelection[0],'h1')),null)
  assert.equal(await html(),before)
 })
 await reset('<article style="padding:90px 32px"><span id="target">Loose text</span></article>');await select('#target')
 await check('a top-level inline label can become a paragraph and round-trips valid HTML',async()=>{
  await retag('p','sidebar');assert.equal(await page.locator('p#target').count(),1)
  const saved=await html();await reset(saved)
  assert.equal(await page.locator('p#target').count(),1)
 })
 for(const lock of ['#target','#em','#page']){
  await reset(fixture);await select('#target')
  await check(`locking ${lock} prevents retagging through both UI and action`,async()=>{
   const before=await html();await page.evaluate(selector=>window.fixtureEditor.setLocked(document.querySelector(selector).dataset.adtId,true),lock);await tick()
   assert.equal(await picker('sidebar').isDisabled(),true)
   assert.equal(await page.evaluate(()=>window.retagTools.retagElement(window.fixtureStore,window.fixtureSelection[0],'p')),null)
   assert.equal(await html(),before);assert.equal(await button('Undo').isDisabled(),true)
  })
 }
 await reset(fixture);await select('#target')
 await check('selection changes close an open picker and reject stale targets',async()=>{
  const id=(await state()).id,before=await html();await picker().click();await select('#after')
  assert.equal(await page.getByRole('listbox').count(),0)
  assert.equal(await page.evaluate(id=>window.retagTools.retagElement(window.fixtureStore,id,'p'),id),null)
  assert.equal(await html(),before);assert.equal(await picker('sidebar').innerText(),'p')
 })
 await reset(fixture);await select('#target')
 await check('same-tag, arbitrary-tag, and multi-selection attempts do not create edits',async()=>{
  const before=await html()
  for(const tag of ['h2','script','img','input','custom-widget'])assert.equal(await page.evaluate(tag=>window.retagTools.retagElement(window.fixtureStore,window.fixtureSelection[0],tag),tag),null)
  await page.evaluate(()=>window.fixtureEditor.toggleSelected(document.querySelector('#after').dataset.adtId));await tick()
  assert.equal(await page.getByRole('combobox',{name:'Change HTML tag'}).count(),0)
  assert.equal(await page.evaluate(()=>window.retagTools.retagElement(window.fixtureStore,window.fixtureSelection[0],'div')),null)
  assert.equal(await html(),before);assert.equal(await button('Undo').isDisabled(),true)
 })
 await reset(fixture);await select('#target')
 await check('active text editing disables retagging without dropping text',async()=>{
  const before=await html();await page.evaluate(()=>window.fixtureEditor.beginTextEdit(window.fixtureSelection[0]));await tick()
  assert.equal(await picker('sidebar').isDisabled(),true)
  assert.equal(await page.evaluate(()=>window.retagTools.retagElement(window.fixtureStore,window.fixtureSelection[0],'p')),null)
  await page.keyboard.press('Escape');await tick();assert.equal(await html(),before)
 })
 await check('structural/media tags stay read-only while headings inside cells remain editable',async()=>{
  await reset(`<article style="padding:90px 32px"><figure id="figure"><img id="image" src="${art}"><figcaption id="caption">Image</figcaption></figure><table><tbody><tr><td id="cell"><h2 id="target">Heading in a cell</h2></td></tr></tbody></table></article>`)
  for(const selector of ['#figure','#image','#caption','#cell']){
   await select(selector);assert.equal(await sidebar().getByRole('combobox',{name:'Change HTML tag'}).count(),0)
   assert.equal(await page.evaluate(()=>window.retagTools.retagElement(window.fixtureStore,window.fixtureSelection[0],'p')),null)
  }
  await select('#target');await retag('p','sidebar');assert.equal(await page.locator('#cell > p#target').count(),1)
 })
 await reset('<article style="padding:90px 32px"><div id="target"><svg id="drawing" viewBox="0 0 20 20" style="width:20px;height:20px"><circle cx="10" cy="10" r="8"/></svg> caption</div></article>');await select('#target')
 await check('opaque inline SVG and comments survive a tag change',async()=>{
  const before=await html(),svg=await page.locator('#drawing').evaluate(el=>el.outerHTML)
  await retag('p');assert.equal(await page.locator('#drawing').evaluate(el=>el.outerHTML),svg)
  await undo(before)
 })
 await reset('<article style="padding:90px 32px"><p id="target">Keyboard example</p></article>');await select('#target')
 await check('tag choices work from the keyboard',async()=>{
  await picker('sidebar').focus();await page.keyboard.press('Enter');await page.getByRole('listbox').waitFor();await tick()
  await page.keyboard.press('Home');await tick();await page.keyboard.press('ArrowDown');await tick();await page.keyboard.press('Enter');await tick()
  assert.equal(await page.locator('h1#target').count(),1)
  assert.equal(await picker('sidebar').evaluate(el=>el===document.activeElement),true)
 })
 await reset(fixture);await select('#target')
 await check('retagging ends Free transform and preserves offsets and sidebar choices',async()=>{
  await button('Inline CSS').click();await button('Tailwind Classes').click()
  await button('Free transform').click();await tick();assert.equal(await page.locator('[data-responsive-transform]').count(),1)
  await picker('sidebar').click();await tick();await page.keyboard.press('Home');await tick()
  await page.keyboard.press('ArrowDown');await tick();await page.keyboard.press('ArrowUp');await tick();await page.keyboard.press('Enter');await tick()
  assert.equal(await page.locator('[data-responsive-transform]').count(),0)
  assert.equal(await page.locator('#target').evaluate(el=>el.style.translate),'12px 3px')
  assert.equal(await button('Inline CSS').getAttribute('aria-expanded'),'false');assert.equal(await button('Tailwind Classes').getAttribute('aria-expanded'),'false')
  await button('Inline CSS').click();await button('Tailwind Classes').click()
 })
 await check('weather Chapter 2 changes from heading to paragraph in memory only',async()=>{
  const url=`${origin}/api/books/C-98-Weather-and-Climate---textbook/pages/pg011`
  const stored=await (await page.request.get(url)).json();await reset(stored.rendering.sections[0].html);await page.waitForTimeout(1200)
  const chapter=page.locator('.adt-canvas').getByText('Chapter 2',{exact:true})
  await chapter.evaluate(el=>window.fixtureEditor.select(el.dataset.adtId));await tick();const before=await html()
  assert.equal(await chapter.evaluate(el=>el.tagName),'H1')
  await picker('sidebar').click();await tick();await page.screenshot({path:'.context/responsive-tag-picker.png',animations:'disabled',clip:{x:0,y:0,width:1240,height:540}})
  await option('p').click();await tick();assert.equal(await chapter.evaluate(el=>el.tagName),'P')
  await undo(before);assert.deepEqual(await (await page.request.get(url)).json(),stored)
 })
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 console.log(`${passed} tag browser checks passed; no book writes`)
} finally {await browser.close()}
