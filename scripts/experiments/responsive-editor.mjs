import assert from 'node:assert/strict'
import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'
// Run against a local Studio dev server; only the in-memory sample is edited.
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
const image = page.locator('#demo-image')
const button = name => page.getByRole('button', { name, exact: true })
const style = () => image.getAttribute('style')
const tick = () => page.waitForTimeout(100)
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS', name) }
async function reset() { await button('Reset sample').click(); await image.click(); await page.getByRole('toolbar', {name:'Quick layout controls'}).waitFor() }
async function drag(from, to, finish=true) { await page.mouse.move(from.x,from.y); await page.mouse.down(); await page.mouse.move(to.x,to.y,{steps:12}); if(finish)await page.mouse.up(); await tick() }
await page.goto(`${process.env.STUDIO_URL ?? 'http://localhost:5173'}/responsive-playground.html`)
await image.waitFor()
await image.click()
await check('alignment uses margins and preserves parent',async()=>{
 const parent = await image.evaluate(el=>el.parentElement.dataset.adtId)
 await button('Align right').click()
 assert.match(await style(), /margin-left: auto/)
 assert.equal(await image.evaluate(el=>el.parentElement.dataset.adtId),parent)
 const right = await image.evaluate(el=>({el:el.getBoundingClientRect().right,parent:el.parentElement.getBoundingClientRect().right,pad:parseFloat(getComputedStyle(el.parentElement).paddingRight)}))
 assert.ok(Math.abs(right.parent-right.el-right.pad-1)<2)
 await button('Undo').click(); assert.doesNotMatch(await style(),/margin-left: auto/)
 await button('Redo').click(); assert.match(await style(),/margin-left: auto/)
})
await reset()
await check('drag selected image horizontally snaps right',async()=>{
 const box=await image.boundingBox(); const parent=await image.locator('..').boundingBox()
 await drag({x:box.x+box.width/2,y:box.y+box.height/2},{x:parent.x+parent.width-50,y:box.y+box.height/2})
 assert.match(await style(),/margin-left: auto/)
 assert.doesNotMatch(await style(),/position: absolute|transform:/)
 await button('Undo').click(); assert.doesNotMatch(await style(),/margin-left: auto/)
})
await reset()
await check('corner resize is fluid and one undo restores it',async()=>{
 const before = await style()
 const box=await page.getByRole('button',{name:'Drag to resize width',exact:true}).nth(3).boundingBox()
 await drag({x:box.x+box.width/2,y:box.y+box.height/2},{x:box.x+90,y:box.y+20})
 assert.match(await style(),/width: 66%/)
 assert.match(await style(),/height: auto/)
 await button('Undo').click(); assert.equal(await style(),before)
})
await reset()
await check('Escape cancels resize without history change',async()=>{
 const before = await style()
 const box=await page.getByRole('button',{name:'Drag to resize width',exact:true}).nth(3).boundingBox()
 await drag({x:box.x+6,y:box.y+6},{x:box.x-80,y:box.y},false)
 await page.keyboard.press('Escape'); await page.mouse.up(); await tick()
 assert.equal(await style(),before)
 assert.equal(await button('Undo').isDisabled(),true)
})
await reset()
await check('pointer cancellation restores styles without creating history',async()=>{
 const before=await style()
 const box=await page.getByRole('button',{name:'Drag to resize width',exact:true}).nth(3).boundingBox()
 await drag({x:box.x+6,y:box.y+6},{x:box.x-70,y:box.y},false)
 await page.dispatchEvent('#demo-image','pointercancel',{pointerId:1})
 await page.mouse.up(); await tick()
 assert.equal(await style(),before)
 assert.equal(await button('Undo').isDisabled(),true)
})
await reset()
await check('document reset during a drag cannot commit to the replacement',async()=>{
 const box=await page.getByRole('button',{name:'Drag to resize width',exact:true}).nth(3).boundingBox()
 await drag({x:box.x+6,y:box.y+6},{x:box.x-70,y:box.y},false)
 await button('Reset sample').dispatchEvent('click')
 await page.mouse.up(); await tick()
 assert.match(await style(),/width: 55%/)
 assert.equal(await button('Undo').isDisabled(),true)
})
await reset()
await check('spacing handle changes bottom margin only',async()=>{
 const box=await button('Drag to change space below').boundingBox()
 await drag({x:box.x+14,y:box.y+6},{x:box.x+14,y:box.y+38})
 assert.equal(await image.evaluate(el=>getComputedStyle(el).marginBottom),'48px')
 assert.match(await style(),/width: 55%/)
})
await reset()
await check('sibling move changes DOM order and undo restores it',async()=>{
 await button('Move later').click()
 assert.equal(await image.evaluate(el=>el.previousElementSibling.tagName),'H2')
 await button('Undo').click()
 assert.equal(await image.evaluate(el=>el.previousElementSibling),null)
})
await reset()
await check('vertical drag reorders without reparenting',async()=>{
 const box=await image.boundingBox(); const heading=await page.locator('.adt-canvas h2').boundingBox()
 const parent=await image.evaluate(el=>el.parentElement.dataset.adtId)
 await drag({x:box.x+100,y:box.y+box.height/2},{x:box.x+100,y:heading.y+heading.height+5})
 assert.equal(await image.evaluate(el=>el.previousElementSibling.tagName),'H2')
 assert.equal(await image.evaluate(el=>el.parentElement.dataset.adtId),parent)
})
await reset()
await check('nested text controls preserve markup',async()=>{
 const heading=page.locator('.adt-canvas h2'); const original=await heading.evaluate(el=>getComputedStyle(el).fontSize)
 await heading.click(); await button('Increase text size').click(); await button('Align right').click()
 assert.equal(await heading.evaluate(el=>getComputedStyle(el).fontSize),`${parseFloat(original)+2}px`)
 assert.equal(await heading.evaluate(el=>getComputedStyle(el).textAlign),'right')
 assert.equal(await heading.textContent(),'Start with this image')
 await button('Select parent').click()
 assert.equal(await page.getByRole('toolbar',{name:'Quick layout controls'}).locator('span').first().innerText(),'div')
})
await reset()
await check('flex row children do not offer unsafe width or alignment',async()=>{
 await page.locator('.adt-canvas h3').first().click(); await button('Select parent').click()
 assert.equal(await button('Increase width').isDisabled(),true)
 assert.equal(await button('Align right').isDisabled(),true)
 assert.equal(await button('Move later').isDisabled(),true)
})
await reset()
await check('layout guards cover grid, inline prose, tables, transforms and mixed image prose',async()=>{
 const results=await page.evaluate(async()=>{
  const {inspectFlow}=await import('/src/components/app/screens/pipeline/editor/responsive/flowLayout.ts')
  const cases=[
   '<div style="display:grid;grid-template-columns:1fr 1fr"><img style="width:50%"></div>',
   '<p>Before <span>inline</span> after</p>',
   '<table><tbody><tr><td>Cell</td></tr></tbody></table>',
   '<div style="transform:rotate(4deg)"><p>Transformed</p></div>',
   '<p>Before <img style="width:20%"> after</p>',
  ]
  const selectors=['img','span','td','p','img']
  return cases.map((html,index)=>{
   const fixture=document.createElement('div'); fixture.innerHTML=html; document.body.append(fixture)
   const flow=inspectFlow(fixture.querySelector(selectors[index])); fixture.remove()
   return {resize:flow.canResize,align:flow.canAlign,order:flow.canReorder}
  })
 })
 assert.deepEqual(results,[{resize:false,align:true,order:false},...Array.from({length:4},()=>({resize:false,align:false,order:false}))])
})
await reset()
await check('desktop screenshot',async()=>{
 await button('Align center').click()
 const toolbar=await page.getByRole('toolbar',{name:'Quick layout controls'}).boundingBox()
 assert.ok(toolbar.height<48,'desktop toolbar fits on one row')
 await page.screenshot({path:'.context/responsive-desktop.png'})
})
await reset()
await check('edited image remains inside parent on mobile and serialized HTML has no overlay',async()=>{
 await button('Increase width').click(); await button('Align right').click(); await button('Mobile').click(); await tick()
 const dims=await image.evaluate(el=>({w:el.getBoundingClientRect().width,p:el.parentElement.clientWidth,scroll:el.closest('.adt-canvas').scrollWidth,client:el.closest('.adt-canvas').clientWidth}))
 assert.ok(dims.w<dims.p); assert.ok(dims.scroll<=dims.client+1)
 await button('Inspect HTML').click()
 await page.waitForTimeout(400)
 const imageBox=await image.boundingBox()
 const overlayBox=await page.locator('[data-responsive-selection]').boundingBox()
 for(const key of ['x','y','width','height']) assert.ok(Math.abs(imageBox[key]-overlayBox[key])<2,`overlay ${key} follows resized viewport`)
 const html=await page.locator('pre').innerText()
 assert.doesNotMatch(html,/data-adt-id|Quick layout controls|position: absolute/)
 assert.match(html,/id="demo-image"/)
 await page.screenshot({path:'.context/responsive-mobile.png'})
})
await button('Inspect HTML').click()
await button('Desktop').click()
const structure=page.getByRole('combobox',{name:'Image structure'})
async function sample(value) {
 await structure.selectOption(value)
 await image.click()
 await page.getByRole('toolbar',{name:'Quick layout controls'}).waitFor()
}
await sample('bare')
await check('bare root image aligns and reorders without a wrapper',async()=>{
 await button('Align right').click()
 assert.match(await style(),/margin-left: auto/)
 await button('Move later').click()
 assert.equal(await image.evaluate(el=>el.previousElementSibling.tagName),'H2')
 assert.equal(await image.evaluate(el=>el.parentElement.classList.contains('adt-canvas')),true)
})
await reset()
await check('wrapping is explicit, preserves the image, and is one undoable action',async()=>{
 const before=await image.evaluate(el=>el.outerHTML)
 await button('Wrap in container').click()
 await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click()
 assert.equal(await image.evaluate(el=>el.outerHTML),before)
 assert.equal(await button('Undo').isDisabled(),true)
 await button('Wrap in container').click()
 await page.screenshot({path:'.context/responsive-wrap-prompt.png',animations:'disabled'})
 await page.getByRole('dialog').getByRole('button',{name:'Wrap in container',exact:true}).click()
 assert.equal(await image.evaluate(el=>el.outerHTML),before)
 assert.equal(await image.evaluate(el=>el.parentElement.children.length),1)
 assert.equal(await button('Wrap in container').count(),0,'no repeated wrapping')
 await button('Inspect HTML').click()
 const serialized=await page.locator('pre').innerText()
 assert.doesNotMatch(serialized,/data-adt-id|data-responsive-selection/)
 assert.equal(await page.evaluate(html=>{
  const parsed=new DOMParser().parseFromString(html,'text/html')
  const image=parsed.querySelector('#demo-image')
  return image.parentElement.tagName==='DIV' && image.parentElement.children.length===1
 },serialized),true,'wrapper survives HTML parsing')
 await button('Inspect HTML').click()
 await button('Undo').click()
 assert.equal(await image.evaluate(el=>el.parentElement.classList.contains('adt-canvas')),true)
 assert.equal(await button('Undo').isDisabled(),true)
 await button('Redo').click()
 assert.equal(await image.evaluate(el=>el.parentElement.children.length),1)
})
await check('dragging a wrapped image moves the wrapper and keeps alignment inside it',async()=>{
 await image.click()
 const wrapperId=await image.evaluate(el=>el.parentElement.dataset.adtId)
 await button('Align center').click()
 assert.match(await style(),/margin-left: auto; margin-right: auto/)
 const box=await image.boundingBox()
 const heading=await page.locator('.adt-canvas h2').boundingBox()
 await drag({x:box.x+box.width/2,y:box.y+box.height/2},{x:box.x+box.width/2,y:heading.y+heading.height+5})
 assert.equal(await image.evaluate(el=>el.parentElement.dataset.adtId),wrapperId)
 assert.equal(await image.evaluate(el=>el.parentElement.previousElementSibling.tagName),'H2')
 await button('Undo').click()
 assert.equal(await image.evaluate(el=>el.parentElement.nextElementSibling.tagName),'H2')
})
await sample('paragraph')
await check('image-only paragraph moves as a unit without changing HTML structure',async()=>{
 const before=await image.evaluate(el=>el.parentElement.outerHTML)
 const box=await image.boundingBox()
 const heading=await page.locator('.adt-canvas h2').boundingBox()
 await drag({x:box.x+100,y:box.y+box.height/2},{x:box.x+100,y:heading.y+heading.height+5})
 assert.equal(await image.evaluate(el=>el.parentElement.outerHTML),before)
 assert.equal(await image.evaluate(el=>el.parentElement.previousElementSibling.tagName),'H2')
 await button('Undo').click()
 assert.equal(await image.evaluate(el=>el.parentElement.nextElementSibling.tagName),'H2')
})
await sample('prose')
await check('blocked inline-image drag explains the restriction without inserting invalid HTML',async()=>{
 const before=await image.evaluate(el=>el.parentElement.outerHTML)
 const box=await image.boundingBox()
 await drag({x:box.x+100,y:box.y+30},{x:box.x+160,y:box.y+30})
 const dialog=page.getByRole('dialog')
 await dialog.waitFor()
 assert.equal(await dialog.getByRole('button',{name:'Wrap in container',exact:true}).count(),0)
 await dialog.getByRole('button',{name:'Select parent',exact:true}).click()
 assert.equal(await image.evaluate(el=>el.parentElement.outerHTML),before)
 assert.equal(await button('Undo').isDisabled(),true)
 assert.equal(await page.getByRole('toolbar',{name:'Quick layout controls'}).locator('span').first().innerText(),'p')
})
await sample('loose')
await check('blocked drag offers valid wrapping next to loose text and then allows alignment',async()=>{
 const box=await image.boundingBox()
 await drag({x:box.x+100,y:box.y+30},{x:box.x+160,y:box.y+30})
 const dialog=page.getByRole('dialog')
 await dialog.getByRole('button',{name:'Wrap in container',exact:true}).click()
 await button('Align right').click()
 assert.match(await style(),/margin-left: auto/)
 assert.equal(await image.evaluate(el=>el.parentElement.nextSibling.textContent.trim()),'Keep the structure')
 assert.equal(await image.evaluate(el=>el.parentElement.children.length),1)
})
await check('wrapping keeps images in existing groups and rejects restricted HTML parents',async()=>{
 const decisions=await page.evaluate(async()=>{
  const {inspectImageContainer}=await import('/src/components/app/screens/pipeline/editor/responsive/flowLayout.ts')
  return ['<p><img></p>','<a href="#"><img></a>','<picture><img></picture>','<ul><img></ul>',
   '<div style="display:flex;flex-direction:column"><img></div>',
   '<div style="display:flex"><img></div>', '<div style="display:grid"><img></div>'].map(html=>{
    const fixture=document.createElement('div'); fixture.classList.add('adt-canvas'); fixture.innerHTML=html; document.body.append(fixture)
    fixture.querySelectorAll('*').forEach((element,index)=>element.dataset.adtId=`fixture-${index}`)
    const canWrap=inspectImageContainer(fixture.querySelector('img')).canWrap
    fixture.remove(); return canWrap
   })
 })
 assert.deepEqual(decisions,Array(7).fill(false))
})
async function wrapAndSelect() {
 await button('Wrap in container').click()
 await page.getByRole('dialog').getByRole('button',{name:'Wrap in container',exact:true}).click()
 await button('Select parent').click()
 return image.locator('..')
}
for (const mode of ['bare','loose']) {
 for (const origin of ['grip','image','blank']) {
  await sample(mode)
  await reset()
  await check(`${mode} selected wrapper reorders from ${origin}, keeping its image and one-step undo`,async()=>{
   const wrapper=await wrapAndSelect()
   const before=await wrapper.evaluate(el=>el.outerHTML)
   const parentId=await wrapper.evaluate(el=>el.parentElement.dataset.adtId)
   assert.equal(await wrapper.getAttribute('class'),null,'a wrapper needs no utility classes to reorder')
   const box=await (origin==='grip'?button('Drag to reposition component'):origin==='image'?image:wrapper).boundingBox()
   const heading=await page.locator('.adt-canvas h2').boundingBox()
   const x=origin==='blank'?box.x+box.width-30:box.x+box.width/2
   const capture=mode==='loose'&&origin==='image'
   await drag({x,y:box.y+box.height/2},{x,y:heading.y+heading.height+5},!capture)
   if(capture) {
    await page.screenshot({path:'.context/responsive-wrapper-reorder.png'})
    await page.mouse.up(); await tick()
   }
   assert.equal(await wrapper.evaluate(el=>el.outerHTML),before,'the image stays inside the same wrapper')
   assert.equal(await wrapper.evaluate(el=>el.parentElement.dataset.adtId),parentId)
   assert.equal(await wrapper.evaluate(el=>el.previousElementSibling.tagName),'H2')
   if(mode==='loose') assert.equal(await page.locator('.adt-canvas h2').evaluate(el=>el.previousSibling.textContent.trim()),'Keep the structure')
   await button('Undo').click()
   assert.equal(await wrapper.evaluate(el=>el.nextElementSibling.tagName),'H2')
   assert.equal(await wrapper.evaluate(el=>el.outerHTML),before)
   await button('Redo').click()
   assert.equal(await wrapper.evaluate(el=>el.previousElementSibling.tagName),'H2')
  })
 }
}
await sample('bare')
await reset()
await check('a click inside the selected wrapper still selects its image without moving it',async()=>{
 const wrapper=await wrapAndSelect()
 const before=await wrapper.evaluate(el=>el.outerHTML)
 await image.click()
 assert.equal(await page.getByRole('toolbar',{name:'Quick layout controls'}).locator('span').first().innerText(),'img')
 assert.equal(await wrapper.evaluate(el=>el.outerHTML),before)
 await button('Undo').click()
 assert.equal(await image.evaluate(el=>el.parentElement.classList.contains('adt-canvas')),true,'only wrapping was recorded in history')
})
await reset()
await check('Escape cancels a wrapper drag started over its image',async()=>{
 const wrapper=await wrapAndSelect()
 const before=await wrapper.evaluate(el=>el.outerHTML)
 const box=await image.boundingBox(); const heading=await page.locator('.adt-canvas h2').boundingBox()
 await drag({x:box.x+100,y:box.y+30},{x:box.x+100,y:heading.y+heading.height+5},false)
 await page.keyboard.press('Escape'); await page.mouse.up(); await tick()
 assert.equal(await wrapper.evaluate(el=>el.outerHTML),before)
 assert.equal(await wrapper.evaluate(el=>el.nextElementSibling.tagName),'H2')
 await button('Undo').click()
 assert.equal(await image.evaluate(el=>el.parentElement.classList.contains('adt-canvas')),true)
})
await sample('loose')
await check('ordering buttons move a wrapper across loose text in both directions',async()=>{
 const wrapper=await wrapAndSelect()
 const before=await wrapper.evaluate(el=>el.outerHTML)
 await button('Move later').click()
 assert.equal(await wrapper.evaluate(el=>el.previousSibling.textContent.trim()),'Keep the structure')
 assert.equal(await wrapper.evaluate(el=>el.nextElementSibling.tagName),'H2')
 await button('Move earlier').click()
 assert.equal(await wrapper.evaluate(el=>{
  let text=''
  for(let next=el.nextSibling;next&&next.nodeType===Node.TEXT_NODE;next=next.nextSibling) text+=next.textContent
  return text.trim()
 }),'Keep the structure')
 assert.equal(await wrapper.evaluate(el=>el.outerHTML),before)
})
await check('text and inline markup form one drop target, including text-only remaining siblings',async()=>{
 const result=await page.evaluate(async()=>{
  const {flowOrder}=await import('/src/components/app/screens/pipeline/editor/responsive/flowOrder.ts')
  const {createEditorStore}=await import('/node_modules/.vite/deps/adt-html-editor.js')
  const store=createEditorStore('<div id="wrapper" style="height:20px"><img id="inside"></div>Before <strong id="emphasis" style="display:inline">bold</strong> after')
  const original=store.actions.getHtml()
  const fixture=document.createElement('div'); fixture.innerHTML=original; document.body.append(fixture)
  const doc=store.state.doc
  for(const node of Object.values(doc.nodes)) {
   if(node.kind==='element'&&node.attrs.id) fixture.querySelector(`#${node.attrs.id}`).dataset.adtId=node.id
  }
  const root=doc.nodes[doc.rootId]
  const wrapper=fixture.querySelector('#wrapper')
  const targets=flowOrder(fixture,root.children)
  store.actions.moveNode(wrapper.dataset.adtId,{parentId:root.id,index:targets[1].after})
  const after=new DOMParser().parseFromString(store.actions.getHtml(),'text/html').body
  const result={count:targets.length,first:after.firstChild.textContent,last:after.lastElementChild.id,prose:after.textContent}
  store.actions.undo(); result.undone=store.actions.getHtml()===original
  fixture.remove(); return result
 })
 assert.deepEqual(result,{count:2,first:'Before ',last:'wrapper',prose:'Before bold after',undone:true})
})
await check('aligning a container preserves its internal flex or grid arrangement',async()=>{
 const results=await page.evaluate(async()=>{
  const {inspectFlow,alignmentStyle,mergedStyle}=await import('/src/components/app/screens/pipeline/editor/responsive/flowLayout.ts')
  return ['flex','grid','inline-flex','inline-grid'].map(display=>{
   const fixture=document.createElement('div')
   fixture.innerHTML=`<div style="display:${display};width:240px;gap:8px;grid-template-columns:1fr 1fr"><span>One</span><span>Two</span></div>`
   document.body.append(fixture)
   const container=fixture.firstElementChild
   const arrangement=()=>{
    const box=container.getBoundingClientRect()
    return [...container.children].map(child=>{
     const rect=child.getBoundingClientRect()
     return [rect.x-box.x,rect.y-box.y,rect.width,rect.height]
    })
   }
   const before=arrangement()
   container.setAttribute('style',mergedStyle(container.getAttribute('style'),alignmentStyle(inspectFlow(container),'center')))
   const result={display:getComputedStyle(container).display,unchanged:JSON.stringify(before)===JSON.stringify(arrangement())}
   fixture.remove(); return result
  })
 })
 assert.deepEqual(results,['flex','grid','flex','grid'].map(display=>({display,unchanged:true})))
})
assert.deepEqual(errors,[])
console.log(`${passed} browser checks passed; no page errors`)
await browser.close()
