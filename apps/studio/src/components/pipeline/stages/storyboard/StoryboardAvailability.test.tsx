// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
const mocks = vi.hoisted(() => ({
  pages: [{ pageId: "p1", sectioningVersion: 1, sectionCount: 1, hasRendering: true, sections: [] }],
  loading: false, state: "idle", coverage: undefined as import("@adt/types").StoryboardCoverage | undefined,
  queue: vi.fn(), header: vi.fn(), select: vi.fn(), unsaved: false,
}))
vi.mock("@lingui/react/macro", () => ({ Trans: ({children}: {children: React.ReactNode}) => <>{children}</>, useLingui: () => ({ t: (s: TemplateStringsArray) => s.join("") }) }))
vi.mock("@lingui/core/macro", () => ({ msg: (s: TemplateStringsArray) => ({id:s.join("")}) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (d: {id:string}) => d.id } }))
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }))
vi.mock("./components/feedback/use-comments-mode", () => ({ useCommentsMode: () => false }))
vi.mock("@/hooks/use-publication-feedback", () => ({ usePublicationComments: () => ({ data: { comments: [] } }) }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({data:mocks.pages,isLoading:mocks.loading}), usePage: () => ({data:{sectioningTree:{sections:[{sectionId:"p1_s1"}]}},isLoading:false}) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({stageState:()=>mocks.state,storyboardCoverage:mocks.coverage,queueRun:mocks.queue}) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({isCompleted:false,isRunning:false,hasError:false}) }))
vi.mock("@/hooks/use-api-key", () => ({useApiKey:()=>({apiKey:"stub"}),useBookStructuredTextAvailability:()=>true}))
vi.mock("@/hooks/use-book-config", () => ({useBookConfig:()=>({data:{config:{}}})}))
vi.mock("@/hooks/use-persist-config", () => ({usePersistConfig:()=>vi.fn()}))
vi.mock("@/hooks/use-debug", () => ({useActiveConfig:()=>({})}))
vi.mock("../../components/StepViewRouter", () => ({useStepHeader:()=>({setExtra:mocks.header,setOnLabelClick:mocks.header})}))
vi.mock("../../components/floating-save", () => ({useHasUnsavedChanges:()=>mocks.unsaved}))
vi.mock("@/routes/books.$label", () => ({useSectionNav:()=>({sectionIndex:0,setSectionIndex:mocks.select,skipNextResetRef:{current:false}})}))
vi.mock("./components/StoryboardSectionDetail", () => ({StoryboardSectionDetail: function DraftEditor() { const [draft, setDraft] = React.useState("Saved activity"); return <><p>Retained page HTML</p><input aria-label="Activity draft" value={draft} onChange={event=>setDraft(event.target.value)} /></> }}))
vi.mock("./components/StoryboardQuizDetail", () => ({StoryboardQuizDetail:()=>null}))
vi.mock("./components/SectioningOverview", () => ({SectioningOverview:()=>null}))
vi.mock("./components/BookOutlineAudit", () => ({BookOutlineAudit:()=>null}))
vi.mock("./components/StoryboardPreview", () => ({StoryboardPreview:()=>null}))
vi.mock("@/components/pipeline/components/CascadeWarning", () => ({CascadeWarning:()=>null}))
vi.mock("@/components/pipeline/components/LandingPageShell", () => ({LandingPageShell:({onRun,extraDisabled}: {onRun:()=>void;extraDisabled:boolean})=><button disabled={extraDisabled} onClick={() => onRun()}>Start storyboard</button>}))
const {StoryboardView}=await import("./StoryboardView")
const {StoryboardLandingPage}=await import("./StoryboardLandingPage")
beforeEach(()=>{mocks.pages=[{pageId:"p1",sectioningVersion:1,sectionCount:1,hasRendering:true,sections:[]}];mocks.loading=false;mocks.unsaved=false;mocks.state="idle";mocks.coverage=undefined;mocks.queue.mockReset()})
afterEach(cleanup)
it.each([true,undefined])("retained cancelled/legacy output does not invent Sectioning changes (coverage %s)",(complete)=>{
 mocks.coverage=complete===undefined?undefined:{complete,included:1,rendered:1,missingPages:[],missingSections:[]}
 render(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 expect(screen.getByText("Retained page HTML")).toBeTruthy()
 expect(screen.queryByText(/Sectioning has changed|Some pages or sections are missing/)).toBeNull()
})
it("reports actual missing output and can rerun saved trees without prior Sectioning attempt rows",()=>{
 mocks.coverage={complete:false,included:2,rendered:1,missingPages:[],missingSections:[{pageId:"p1",sectionId:"p1_s2"}]}
 render(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 expect(screen.getByText(/Some pages or sections are missing Storyboard output/)).toBeTruthy()
 fireEvent.click(screen.getByRole("button",{name:"Re-run Storyboard"}))
 expect(mocks.queue).toHaveBeenCalledWith({fromStage:"storyboard",toStage:"storyboard",apiKey:"stub"})
})
it("does not show missing-work notice during a run",()=>{
 mocks.state="running";mocks.coverage={complete:false,included:2,rendered:1,missingPages:["p2"],missingSections:[]}
 render(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 expect(screen.queryByText(/Some pages or sections are missing/)).toBeNull()
})
it.each(["saved","missing","loading"])("selects safe older-book entry stage from actual %s page inputs",(state)=>{
 if(state==="missing")mocks.pages.push({pageId:"p2",sectioningVersion:null as unknown as number,sectionCount:0,hasRendering:false,sections:[]})
 mocks.loading=state==="loading"
 render(<StoryboardLandingPage bookLabel="book" />)
 fireEvent.click(screen.getByRole("button",{name:"Start storyboard"}))
 if(state==="loading")expect(mocks.queue).not.toHaveBeenCalled()
 else expect(mocks.queue).toHaveBeenCalledWith({fromStage:state==="saved"?"storyboard":"sectioning",toStage:"storyboard",apiKey:"stub",viewAfter:true})
})

it("retains an editor draft when missing-output coverage and attempt state toggle its notice", () => {
 mocks.coverage={complete:true,included:2,rendered:2,missingPages:[],missingSections:[]}
 const view=render(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 fireEvent.change(screen.getByRole("textbox",{name:"Activity draft"}),{target:{value:"Unsaved activity draft"}})
 mocks.coverage={complete:false,included:2,rendered:1,missingPages:["p2"],missingSections:[]}
 view.rerender(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 expect(screen.getByText(/Some pages or sections are missing Storyboard output/)).toBeTruthy()
 expect((screen.getByRole("textbox",{name:"Activity draft"}) as HTMLInputElement).value).toBe("Unsaved activity draft")
 mocks.state="running"
 view.rerender(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 expect(screen.queryByText(/Some pages or sections are missing/)).toBeNull()
 expect((screen.getByRole("textbox",{name:"Activity draft"}) as HTMLInputElement).value).toBe("Unsaved activity draft")
 for (const state of ["error", "idle"]) {
  mocks.state=state
  view.rerender(<StoryboardView bookLabel="book" selectedPageId="p1" />)
  expect(screen.getByText(/Some pages or sections are missing Storyboard output/)).toBeTruthy()
  expect((screen.getByRole("textbox",{name:"Activity draft"}) as HTMLInputElement).value).toBe("Unsaved activity draft")
 }
 mocks.state="idle";mocks.coverage={complete:true,included:2,rendered:2,missingPages:[],missingSections:[]}
 view.rerender(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 expect((screen.getByRole("textbox",{name:"Activity draft"}) as HTMLInputElement).value).toBe("Unsaved activity draft")
})

it("retains a dirty saved-tree editor after all active Storyboard output is reset", () => {
 mocks.coverage={complete:true,included:1,rendered:1,missingPages:[],missingSections:[]}
 const view=render(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 fireEvent.change(screen.getByRole("textbox",{name:"Activity draft"}),{target:{value:"Draft before all-page reset"}})
 mocks.unsaved=true;mocks.pages=mocks.pages.map(page=>({...page,hasRendering:false}))
 mocks.coverage={complete:false,included:1,rendered:0,missingPages:["p1"],missingSections:[]}
 view.rerender(<StoryboardView bookLabel="book" selectedPageId="p1" />)
 expect((screen.getByRole("textbox",{name:"Activity draft"}) as HTMLInputElement).value).toBe("Draft before all-page reset")
})
