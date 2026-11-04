// Regression reproduced independently during the SPEC-0003 October 12 review.
// This invokes the production fresh-run rendering executor, with scheduling and
// extraction admission stubbed; extraction/resume is deliberately not claimed.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { createBookStorage, writeSectioningLifecycle } from "@adt/storage"
const { render } = vi.hoisted(() => ({ render: vi.fn() }))
vi.mock("../web-rendering.ts", async (actual) => ({ ...await actual<any>(), renderPage: render }))
vi.mock("../extraction-admission.ts", async (actual) => ({ ...await actual<any>(), prepareExtractionAdmission: () => ({outcome:"fresh"}) }))
vi.mock("../dag.ts", async (actual) => ({ ...await actual<any>(), runPipelineDAG: async (executors:any, progress:any) => {await executors.get("web-rendering")(progress);return {status:"completed"}} }))
import { runFullPipeline } from "../pipeline-dag.ts"

let root: string, cfg: string
const label = "book"
const store = () => createBookStorage(label, root)
const tree = (id: string, count = 1) => ({ source: "ai", reasoning: "safe tree", sections: Array.from({length:count}, (_,i)=>({ sectionId: `${id}_sec00${i+1}`, sectionType: "text", pageNumber: Number(id.slice(1)), isPruned:false, backgroundColor:"white", textColor:"black", nodes:[{nodeId:`${id}_t00${i+1}`,role:"text",text:`text ${i}`,isPruned:false}] })) })
const html = (input: any) => ({ sections: input.sectioning.sections.map((s: any,i: number)=>({sectionIndex:i,sectionId:s.sectionId,sectionType:s.sectionType,reasoning:"generated",html:`<section data-section-id="${s.sectionId}">generated ${s.sectionId}</section>`})) })
beforeEach(()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),"independent-spec3-")); cfg=path.join(root,"global.yaml")
 fs.writeFileSync(cfg,"structure_types: {}\nrole_types: {}\ndefault_model: ollama:llama3\nconcurrency: 1\npage_sectioning:\n  mode: page\n")
 const s=store(); for(const n of [2,7]) { const id=`p${n}`;s.putExtractedPage({pageId:id,pageNumber:n,text:"source",images:[],pageImage:{imageId:`${id}_page`,buffer:Buffer.from("pixels"),hash:"test",format:"png",width:4,height:6}});s.putNodeData("page-sectioning",id,tree(id)); } s.putNodeData("book-outline","book",{entries:[],styleClusters:[],reasoning:"fixture"}); s.markStepCompleted("book-outline"); s.close()
 writeSectioningLifecycle(path.join(root,label),"page",true)
 render.mockReset().mockImplementation(async(input)=>html(input))
})
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}))
it("fresh CLI reflowable executor publishes a completed first page before the next provider starts",async()=>{
 const s=store();for(const id of ["p2","p7"])s.putNodeData("image-filtering",id,{images:[]});s.close()
 const pdf=path.join(root,"fixture.pdf");fs.writeFileSync(pdf,"stub pdf; extraction not exercised by this executor probe")
 let observed:unknown
 render.mockImplementation(async(input)=>{if(input.pageId==="p7"){const s=store();try{observed=s.getLatestNodeData("web-rendering","p2")}finally{s.close()}}return html(input)})
 await runFullPipeline({label,booksRoot:root,pdfPath:pdf,promptsDir:root,templatesDir:root,configPath:cfg},{emit(){}})
 expect(observed).toMatchObject({data:{sections:[{sectionId:"p2_sec001"}]}})
})
