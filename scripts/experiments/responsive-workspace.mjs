import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'
// Real Storyboard shell, two rails open: regressions hidden by a full-width lab.
// All edits stay in browser drafts or the playground. The script never saves.
const origin=process.env.STUDIO_URL ?? 'http://localhost:5173'
const book=process.env.BOOK ?? 'C-98-Weather-and-Climate---textbook'
const pageId=process.env.PAGE ?? 'pg012'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const errors=[],writes=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('request',r=>{if(r.url().includes('/api/books/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.method()+' '+r.url())})
const endpoint=`${origin}/api/books/${encodeURIComponent(book)}/pages/${encodeURIComponent(pageId)}`
const baseline=await (await page.request.get(endpoint)).json()
const button=name=>page.getByRole('button',{name,exact:true})
const aside=page.locator('.adt-canvas aside').first()
const tick=()=>page.waitForTimeout(200)
let passed=0
async function check(name,run){await run();console.log('PASS',name);passed++}
async function reset(){await page.goto(`${origin}/pipeline/${encodeURIComponent(book)}/pages/${encodeURIComponent(pageId)}`);await aside.waitFor();await tick()}
async function selectAside(){await aside.locator('h3').first().click();await tick()}
async function action(name){await button('Component layout').click();await button(name).click();await tick()}
async function dragAside(point){await selectAside();await button('Drag to reposition component').click();await tick();const a=await aside.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+30);await page.mouse.down();await page.mouse.move(point.x,point.y,{steps:15});await tick()}
const contents=()=>page.locator('.adt-canvas [data-id]').evaluateAll(els=>els.map(el=>[el.dataset.id,el.textContent,el.getAttribute('src')]).sort(([a],[b])=>a.localeCompare(b)))
await reset()
await check('Wrap text · object on right visibly wraps text at the actual 794px editor width and undoes',async()=>{
 const width=(await page.locator('.adt-canvas').boundingBox()).width
 assert.ok(width>640&&width<1024,`Expected medium editor width, got ${width}`)
 const before=await aside.getAttribute('class'),copy=await contents()
 assert.equal(await aside.evaluate(el=>getComputedStyle(el).float),'none')
 await selectAside();await action('Wrap text · object on right')
 assert.equal(await aside.evaluate(el=>getComputedStyle(el).float),'right')
 assert.equal(await aside.evaluate(el=>{const text=el.nextElementSibling.querySelector('span').getBoundingClientRect();const box=el.getBoundingClientRect();return text.right<=box.left+1&&text.top<box.bottom}),true)
 assert.deepEqual(await contents(),copy)
 await button('Undo').click();await tick();assert.equal(await aside.getAttribute('class'),before)
})
await reset()
await check('neighbour action builds two visible columns without rearranging aside internals',async()=>{
 const before=await aside.innerHTML(),copy=await contents()
 await selectAside();await action('Side by side with previous item')
 assert.equal(await aside.evaluate(el=>{const parent=el.parentElement;const [a,b]=[...parent.children].map(el=>el.getBoundingClientRect());return parent.children[0].tagName==='P'&&getComputedStyle(parent).display==='grid'&&Math.abs(a.top-b.top)<1&&b.left>a.right}),true)
 assert.equal(await aside.innerHTML(),before);assert.deepEqual(await contents(),copy)
 await button('Undo').click();await tick();assert.equal(await aside.evaluate(el=>el.parentElement.tagName),'SECTION')
})
await reset()
await check('dropping an aside in the gap after a paragraph commits a reorder',async()=>{
 const target=await page.locator('.adt-canvas aside + p').boundingBox()
 await dragAside({x:target.x+target.width/2,y:target.y+target.height+5})
 assert.equal(await page.locator('[data-arrange-target]').count(),1)
 assert.match((await page.getByRole('status').allTextContents()).join(' '),/Place after/)
 await page.mouse.up();await tick()
 assert.equal(await aside.evaluate(el=>el.previousElementSibling.textContent.startsWith('Rain is drops')),true)
 assert.match((await page.getByRole('status').allTextContents()).join(' '),/Component moved/)
 await button('Undo').click();await tick();assert.equal(await aside.evaluate(el=>el.nextElementSibling.textContent.startsWith('Rain is drops')),true)
})
await reset()
await check('dragging across a full-width aside changes it to a right float with a visible result',async()=>{
 const a=await aside.boundingBox()
 await dragAside({x:a.x+a.width-35,y:a.y+50})
 assert.match((await page.getByRole('status').allTextContents()).join(' '),/Wrap text.*right/)
 await page.mouse.up();await tick();assert.equal(await aside.evaluate(el=>getComputedStyle(el).float),'right')
 await button('Undo').click();await tick();assert.equal(await aside.evaluate(el=>getComputedStyle(el).float),'none')
})
await reset()
await check('invalid drops explain that nothing moved and create no history',async()=>{
 const before=await aside.getAttribute('class')
 await dragAside({x:1250,y:600})
 assert.equal(await page.locator('[data-arrange-target]').count(),0)
 await page.mouse.up();await tick()
 assert.match((await page.getByRole('status').allTextContents()).join(' '),/Nothing moved/)
 assert.equal(await aside.getAttribute('class'),before);assert.equal(await button('Undo').isDisabled(),true)
})
await page.goto(`${origin}/responsive-playground.html?book=${encodeURIComponent(book)}&page=${encodeURIComponent(pageId)}`)
await aside.waitFor();await button('Editor width').click();await tick()
await check('page test copy has real columns at editor width, preserves all content and stacks on mobile',async()=>{
 const fixtureContent=await contents()
 assert.equal(await page.getByRole('combobox',{name:'Image structure'}).inputValue(),'book-columns')
 assert.equal(await aside.evaluate(el=>{const row=el.parentElement.parentElement;const [a,b]=[...row.children].map(el=>el.getBoundingClientRect());return getComputedStyle(row).display==='grid'&&row.children.length===2&&Math.abs(a.top-b.top)<1&&b.left>a.right}),true)
 await page.screenshot({path:'.context/weather-page4-two-columns.png',animations:'disabled'})
 await button('Mobile').click();await tick()
 assert.equal(await aside.evaluate(el=>{const row=el.parentElement.parentElement;const [a,b]=[...row.children].map(el=>el.getBoundingClientRect());return b.top>=a.bottom}),true)
 assert.equal(await page.locator('.adt-canvas').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
 await page.getByRole('combobox',{name:'Image structure'}).selectOption('book');await tick()
 assert.deepEqual(await contents(),fixtureContent)
})
await page.getByRole('combobox',{name:'Image structure'}).selectOption('book-columns');await button('Editor width').click();await tick()
await check('a text span moves its whole paragraph into the blank area below the other column',async()=>{
 const paragraph=page.locator('.adt-canvas p').first()
 const original=await paragraph.innerHTML()
 await paragraph.locator('span').first().click();await tick()
 await button('Drag to reposition component').click();await tick()
 const a=await paragraph.boundingBox(),b=await aside.boundingBox()
 await page.mouse.move(a.x+40,a.y+25);await page.mouse.down()
 await page.mouse.move(b.x+b.width/2,b.y+b.height+35,{steps:15});await tick()
 assert.match((await page.getByRole('status').allTextContents()).join(' '),/Move inside/)
 await page.mouse.up();await tick()
 assert.equal(await aside.evaluate(el=>el.nextElementSibling?.tagName),'P')
 assert.equal(await aside.locator('xpath=following-sibling::p').innerHTML(),original)
 await button('Undo').click();await tick()
 assert.equal(await aside.evaluate(el=>el.nextElementSibling),null)
})
const saved=await (await page.request.get(endpoint)).json()
assert.deepEqual(saved.rendering,baseline.rendering);assert.deepEqual(saved.versions,baseline.versions)
assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
await browser.close()
console.log(`${passed} workspace/page-copy checks passed; no browser errors or book writes`)
