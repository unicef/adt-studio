import { chromium } from '../../packages/pipeline/node_modules/playwright/index.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
const base = 'http://127.0.0.1:41789'
const [books, output] = process.argv.slice(2)
if (!books || !output) throw new Error('Supply disposable books and screenshot output directory')
fs.mkdirSync(output, {recursive:true})
const db=books+'/momograde1/momograde1.db'
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(db)).digest('hex')
const before=hash(), errors=[]
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try {
 const page=await browser.newPage({viewport:{width:1400,height:1000}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/books/momograde1',{waitUntil:'domcontentloaded'})
 await page.request.post(base+'/__fixture/decision')
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('dialog').waitFor()
 await page.getByText('Attempts made: 3').waitFor()
 await page.getByRole('checkbox').check()
 assert.equal(await page.getByRole('button',{name:'Retry this page'}).isDisabled(),true)
 await page.getByRole('checkbox').uncheck()
 let rejected=false
 await page.route('**/stages/decision',async route=>{
   if(!rejected){rejected=true;await route.fulfill({status:409,body:'Stale inputs'})}else await route.continue()
 })
 await page.getByRole('button',{name:'Retry this page'}).click()
 await page.getByRole('alert').filter({hasText:'The decision was not accepted'}).waitFor()
 const dialogBox = await page.getByRole('dialog').boundingBox()
 for (const button of await page.getByRole('dialog').getByRole('button').all()) {
   const box = await button.boundingBox()
   if (box) assert.ok(box.x >= dialogBox.x && box.x + box.width <= dialogBox.x + dialogBox.width, 'Dialog actions stay inside the panel')
 }
 await page.screenshot({path:output+'/rejected-retry.png'})
 await page.getByRole('button',{name:'Refresh status'}).click()
 await page.getByRole('button',{name:'Retry this page'}).click()
 await page.getByRole('dialog').waitFor({state:'hidden'})
 await page.reload({waitUntil:'domcontentloaded'})
 assert.equal(await page.getByRole('dialog').count(),0)
 await page.request.post(base+'/__fixture/decision')
 // Simulate SSE loss; authoritative polling still recovers the decision.
 await page.route('**/stages/events*',route=>route.abort())
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('dialog').waitFor()
 const second=await browser.newPage()
 await second.goto(base+'/books/momograde1',{waitUntil:'domcontentloaded'})
 await second.getByRole('dialog').waitFor()
 await second.getByRole('button',{name:'Stop step',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'hidden',timeout:15000})
 await page.request.post(base+'/__fixture/decision?unsupported=1')
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('dialog').waitFor()
 assert.equal(await page.getByRole('button',{name:'Retry this page'}).count(),0)
 await page.getByRole('button',{name:'Skip page and continue'}).click()
 await page.getByRole('dialog').waitFor({state:'hidden'})
 await page.goto(base+'/books/momograde1/captions?lang=en',{waitUntil:'domcontentloaded'})
 await page.getByRole('status').filter({hasText:'Skipped after error: pg005'}).first().waitFor()
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('status').filter({hasText:'Skipped after error: pg005'}).first().waitFor()
 await page.screenshot({path:output+'/caption-skip.png'})
 await page.goto(base+'/books/momograde1/debug?tab=logs',{waitUntil:'domcontentloaded'})
 await page.getByTitle('Skipped after error',{exact:true}).first().waitFor()
 await page.getByRole('row').filter({hasText:'page-error-decision'}).filter({hasText:'image-captioning'}).getByText('page-error-decision',{exact:true}).click()
 await page.getByText('Rate limit',{exact:true}).waitFor()
 await page.getByText('spec0013-image-captioning',{exact:true}).waitFor()
 assert.match(await page.locator('body').innerText(), /Provider call\s+No/)
 await page.screenshot({path:output+'/durable-skip-log.png'})
 assert.equal(hash(),before)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({retry:true,bulkRetryDisabled:true,rejectedRetryRetained:true,pollRecovery:true,twoTabs:true,reload:true,unsupportedRetryHidden:true,bookUnchanged:true,durableCaptionWarning:true,durableDiagnostic:true,errors}))
} catch(error) {
 for (const [i,p] of browser.contexts().flatMap(c=>c.pages()).entries()) { console.log('Failed page',i,await p.locator('body').innerText()); await p.screenshot({path:output+'/failure-'+i+'.png'}) }
 throw error
} finally {await browser.close()}
