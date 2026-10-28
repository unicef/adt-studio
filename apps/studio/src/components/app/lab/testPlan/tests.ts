import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { FaultScenario, JourneyScenario, RunScenario, SlowLoadScenario } from "../simulate"
import type { VariantKey } from "../variants"

export type LabSim = Omit<RunScenario, "startedAt"> | SlowLoadScenario | Omit<JourneyScenario, "startedAt"> | Omit<FaultScenario, "startedAt">

export interface LabState {
  id: string
  label: MessageDescriptor
  hint?: MessageDescriptor
  path?: string
  atMs?: number
  pauseAtMs?: number
  play?: boolean
  sim?: LabSim | null
  runsAgo?: Record<string, number>
  outputs?: string[]
  needsDismissed?: boolean
  reload?: boolean
}

export interface LabTest {
  id: string
  group: VariantKey
  title: MessageDescriptor
  changes: MessageDescriptor
  variants: Partial<Record<VariantKey, string>>
  sim?: LabSim
  states?: LabState[]
  section?: "flow" | "solo"
  freshOutputs?: boolean
  noPick?: boolean
  path: string
  reload?: boolean
  inheritPicks?: VariantKey[]
  steps: MessageDescriptor[]
  lookFor: MessageDescriptor[]
  compare: MessageDescriptor
}

export const TEST_BOOKS = {
  fresh: "lab-raven",
  done: "lab-triste",
} as const

const FRESH = TEST_BOOKS.fresh
const DONE = TEST_BOOKS.done

export const RECOMMENDED: Partial<Record<VariantKey, string>> = {
  entry: "gated",
  running: "live",
  loaders: "content",
  features: "suggested",
  landing: "action-first",
  return: "toast",
  export: "topbar",
  ai: "wired",
}

export const JOURNEY = {
  kind: "journey" as const,
  book: DONE,
  total: 21,
  holdFresh: true,
  phases: [
    { stage: "extract", step: "extract", durationMs: 26000 },
    { stage: "sectioning", step: "page-sectioning", durationMs: 20000 },
    { stage: "storyboard", step: "web-rendering", durationMs: 26000 },
  ],
}

export const FRESH_AFTER_SETUP = {
  kind: "journey" as const,
  book: DONE,
  total: 21,
  holdFresh: true,
  phases: [
    { stage: "extract", step: "extract", durationMs: 1 },
    { stage: "sectioning", step: "page-sectioning", durationMs: 1 },
    { stage: "storyboard", step: "web-rendering", durationMs: 1 },
  ],
}

export const LAB_TESTS: LabTest[] = [
  {
    id: "flow-journey",
    section: "flow",
    noPick: true,
    group: "entry",
    title: msg`Flow v2 · The whole setup, as a new book`,
    changes: msg`Picks up where auto mode's "Open the book" hands over: extraction is already running. It streams, moves on to Sectioning, then the storyboard builds page by page and becomes home. Simulated (~75 seconds), on a fresh-looking copy of "[Lab] Triste fim…".`,
    variants: RECOMMENDED,
    sim: JOURNEY,
    freshOutputs: true,
    path: `/pipeline/${DONE}`,
    steps: [
      msg`You land on Extract (not an empty storyboard). The "Setting up" bar shows Extraction running.`,
      msg`Pages stream in: real cards appear in order, placeholders after them. No blank screens, no lone spinners.`,
      msg`When extraction finishes, a toast moves you to Sectioning, which is already running (run-through).`,
      msg`When sectioning finishes, you land on the storyboard: pages build one by one — each shows your real PDF page with a scan until it is ready.`,
      msg`Once the storyboard is done, the "Setting up" bar folds away and a card asks who will read the book: from now on you work from the storyboard.`,
      msg`The dock holds only Extract and Sectioning, plus a highlighted "Outputs" button — optional outputs are not in the way.`,
    ],
    lookFor: [
      msg`Is it always obvious what is happening and what comes next?`,
      msg`Anything that still feels like waiting on an empty screen?`,
      msg`Does it line up with how auto mode hands over ("the first pages are on their way")?`,
    ],
    compare: msg`Press "Set up and open" on "Flow v2 · The same moment today" right after this one.`,
  },
  {
    id: "flow-today",
    section: "flow",
    noPick: true,
    group: "entry",
    title: msg`Flow v2 · The same moment today`,
    changes: msg`The same simulated setup with every variant on Current, for comparison.`,
    variants: {},
    sim: JOURNEY,
    freshOutputs: true,
    path: `/pipeline/${DONE}`,
    steps: [
      msg`Watch the same ~75 seconds: you start on the storyboard, extraction shows as a centered card, nothing moves you along.`,
    ],
    lookFor: [
      msg`Which moments felt worst today? Note them — they are the ones to get right.`,
    ],
    compare: msg`Compare with the previous test.`,
  },
  {
    id: "flow-outputs",
    section: "flow",
    group: "features",
    title: msg`Flow v2 · Adding optional outputs`,
    changes: msg`After setup the dock holds only the foundation steps. A card asks who will read the book and adds what they need; everything else waits in the Outputs popover. Runs are simulated — no credits.`,
    variants: { ...RECOMMENDED },
    sim: FRESH_AFTER_SETUP,
    freshOutputs: true,
    path: `/pipeline/${DONE}/pages/pg008009`,
    steps: [
      msg`On the storyboard, a card asks "Your pages are ready. Who will read this book?" Pick "Readers who can't see the pictures" and "Readers who listen", then Add 2.`,
      msg`The dock now holds Image descriptions, Read aloud and Languages (Read aloud uses it, the toast says why) — outlined in their colors, not run yet.`,
      msg`Open "Outputs": the suggested group comes first with the same reader-facing names; the × chips remove what you added, and "Help me choose for my readers" brings the card back after Not now.`,
      msg`Open Image descriptions from the dock: its real "never run" setup page shows. Press "Describe the images" — a simulated ~12 s run (no credits) streams, then the descriptions appear and a toast offers a way back to the storyboard.`,
      msg`Switch Outputs to "Add when needed" in the toolbar: no card, plain names — compare.`,
    ],
    lookFor: [
      msg`Is asking "Who will read this book?" the right moment, or should auto mode ask it up front?`,
      msg`Do the reader-facing names (Image descriptions, Read aloud, Languages, Accessibility check) work for you everywhere?`,
    ],
    compare: msg`Switch Outputs to Current: every output sits in the dock from the start.`,
  },
  {
    id: "flow-loaders",
    section: "flow",
    group: "loaders",
    title: msg`Flow v2 · Loading shows content, not spinners`,
    changes: msg`Opening a stage while its data loads shows the stage's shape; this reloads the window with a simulated 5-second slow load.`,
    variants: { loaders: "content" },
    sim: { kind: "slow-load", delayMs: 5000 },
    path: `/pipeline/${DONE}/quizzes`,
    reload: true,
    steps: [
      msg`During the reload you see the app skeleton, then the Quizzes stage skeleton (rail rows and cards), then the real stage.`,
    ],
    lookFor: [
      msg`Does any step still show a lone spinner or "Loading…"?`,
    ],
    compare: msg`Switch Loading states to Current and press Set up again.`,
  },
  {
    id: "entry-gated",
    section: "solo",
    group: "entry",
    title: msg`Entry: books open on the step that is actually next`,
    changes: msg`Before extract and sectioning are done, opening a book lands on that foundation stage instead of an empty storyboard.`,
    variants: { entry: "gated" },
    path: `/pipeline/${FRESH}`,
    steps: [
      msg`State "Opening a book mid-setup": "[Lab] Hyena and Raven" (extract done, no sections) lands on Sectioning, not on "The storyboard is still empty".`,
      msg`Look at the stage header: the back pill leaves the pipeline, because there is no storyboard yet.`,
      msg`State "Opening a processed book": "[Lab] Triste fim…" still opens on the storyboard.`,
    ],
    lookFor: [
      msg`Does landing on Sectioning feel like the obvious next step, or like being redirected?`,
      msg`Any dead end: a back button that sends you somewhere useless?`,
    ],
    compare: msg`Switch Entry to Current in the toolbar and open "[Lab] Hyena and Raven" again — you get the empty storyboard.`,
  },
  {
    id: "landing-action-first",
    group: "landing",
    title: msg`Stage landing: the run button above the fold`,
    changes: msg`On a stage that has never run, the title, what is missing and the run button come first; the sample preview moves below and shrinks.`,
    variants: { landing: "action-first" },
    path: `/pipeline/${FRESH}/sectioning`,
    steps: [
      msg`At 1440 wide, without scrolling, find the Run Sectioning button and the "Before running" checklist.`,
      msg`Open Image Captions from the dock — a locked stage. The reason ("Run Storyboard first") should be visible straight away.`,
      msg`Scroll down: the sample preview is still there, smaller.`,
      msg`Switch Stage landing to Compact in the toolbar: one centered column, no preview until you press "Show an example of the result".`,
      msg`On the locked Image Captions stage, the header chip now says "Needs Storyboard" instead of "12 pages ready" (Action first does this too).`,
    ],
    lookFor: [
      msg`Can you tell what to do next in under three seconds?`,
      msg`Does losing the big preview hurt the explanation of what the stage does?`,
    ],
    compare: msg`Switch Stage landing to Current: the preview fills the screen and the run button sits behind the dock.`,
  },
  {
    id: "running-extract",
    group: "running",
    title: msg`Running · Extract: pages arriving`,
    changes: msg`While extract runs, the stage keeps its layout; pages land one by one and the rest show as placeholders. Simulated — no pipeline runs, no credits.`,
    variants: { running: "live" },
    sim: { kind: "run", book: DONE, stage: "extract", step: "extract", durationMs: 40000, total: 21, loop: true, arrivingPages: true },
    path: `/pipeline/${DONE}/extract`,
    steps: [
      msg`Watch for ~20 seconds: real page cards appear in order, placeholders shimmer after them.`,
      msg`The progress strip shows "N / 21" and the step list; there is only one Cancel (in the header).`,
      msg`Existing content stays in place — no dimming overlay over the stage.`,
      msg`Switch Running to Strip only in the toolbar while it runs: the real cards stay, no placeholders, just the strip on top.`,
    ],
    lookFor: [
      msg`Does it feel alive, or noisy?`,
      msg`Is it clear what is still coming?`,
    ],
    compare: msg`Switch Running to Current: pages show dimmed to 60%, with a second inline Cancel card.`,
  },
  {
    id: "running-captions",
    group: "running",
    title: msg`Running · Captions: a stage without per-page progress`,
    changes: msg`Your real page thumbnails sit in gray under a shimmer until the stage finishes, instead of one small centered spinner card.`,
    variants: { running: "live" },
    sim: { kind: "run", book: FRESH, stage: "captions", step: "image-captioning", durationMs: 30000, total: 12, loop: true },
    path: `/pipeline/${FRESH}/captions`,
    steps: [
      msg`See the page grid with real thumbnails in grayscale, filling in color with a check.`,
      msg`The stage header keeps its chips and the progress bar at its bottom edge.`,
      msg`Switch Running to Strip only: the stage shows just the progress strip — compare how much it tells you.`,
    ],
    lookFor: [
      msg`Does showing per-page progress mislead here, since captions really runs book-wide?`,
    ],
    compare: msg`Switch Running to Current: the whole stage becomes one small card in the middle.`,
  },
  {
    id: "running-hub",
    group: "running",
    title: msg`Running · Storyboard hub while sectioning runs`,
    changes: msg`On the storyboard, a running foundation stage shows the live page grid instead of a centered card.`,
    variants: { running: "live", entry: "current" },
    sim: { kind: "run", book: FRESH, stage: "sectioning", step: "page-sectioning", durationMs: 30000, total: 12, loop: true },
    path: `/pipeline/${FRESH}`,
    steps: [
      msg`Pages tick off left to right with a check as sectioning "reaches" them.`,
    ],
    lookFor: [
      msg`Would you rather be taken to the Sectioning stage itself while it runs? (That is what Entry · Gated does.)`,
    ],
    compare: msg`Switch Running to Current to see the centered card version.`,
  },
  {
    id: "running-validation",
    group: "running",
    title: msg`Running · Validation now shows that it is running`,
    changes: msg`Validation used to look identical idle or running. With Live or Strip, its header shows progress and a strip appears. Simulated.`,
    variants: { running: "live" },
    sim: { kind: "run", book: DONE, stage: "package", step: "accessibility-assessment", durationMs: 30000, total: 26, loop: true },
    path: `/pipeline/${DONE}/validation`,
    steps: [
      msg`The Validation header shows the running chips and the progress line along its bottom edge.`,
      msg`A progress strip sits above the results.`,
    ],
    lookFor: [
      msg`Is it clear the existing results are from the previous run while a new one is going?`,
    ],
    compare: msg`Switch Running to Current: Validation looks exactly the same as when idle.`,
  },
  {
    id: "return-toast",
    group: "return",
    title: msg`Return · toast`,
    changes: msg`Back keeps the page you were on, and a finished run pops a toast at the bottom right with a way back. The run is simulated and finishes after ~12 seconds.`,
    variants: { return: "toast" },
    sim: { kind: "run", book: DONE, stage: "captions", step: "image-captioning", durationMs: 12000, total: 21 },
    path: `/pipeline/${DONE}/captions?page=pg008009`,
    steps: [
      msg`Wait for the toast "Image Captions finished" and use its "View on storyboard" action.`,
    ],
    lookFor: [
      msg`Would you notice the toast while working in another part of the screen? Does it stay too long?`,
    ],
    compare: msg`Press Set up again with Return on Current: nothing appears when the run ends and back always goes to the last storyboard page.`,
  },
  {
    id: "ai",
    group: "ai",
    title: msg`AI panel: hidden vs wired`,
    changes: msg`Wired: on the storyboard the panel really submits an edit for a section; on stage screens it is gone. AI calls are simulated in the lab — no credits are spent.`,
    variants: { ai: "wired" },
    path: `/pipeline/${DONE}/pages/pg008009`,
    steps: [
      msg`The panel header shows "page 8 · section 1"; on a page with several sections, use the section chips.`,
      msg`Click a suggestion — it fills the composer. Press Enter: "Editing section 1…" shows for a few seconds (simulated).`,
      msg`If no AI provider is set up, the composer says so instead.`,
      msg`Open Captions from the dock: no AI panel, and the content uses the full width.`,
      msg`Switch AI panel to Hidden: gone on the storyboard too.`,
    ],
    lookFor: [
      msg`Is removing the panel from stage screens right, or do you want stage-specific AI there later?`,
    ],
    compare: msg`Switch AI panel to Current: buttons that do nothing and sectioning prompts on every stage.`,
  },
  {
    id: "export",
    group: "export",
    title: msg`Export: reachable from Preview`,
    changes: msg`Preview gets an Export button that opens an export screen with every format.`,
    variants: { export: "preview-button" },
    path: `/pipeline/${DONE}/preview`,
    steps: [
      msg`Click Export in the Preview header.`,
      msg`Check the six formats; optionally run a Web Export on the lab book (local packaging, no AI).`,
      msg`Use "Back": it returns to where you came from (Preview or the storyboard).`,
      msg`Switch Export to "Preview + storyboard": the storyboard top bar now has an Export button too.`,
    ],
    lookFor: [
      msg`Should Export also live in the storyboard top bar or the dock?`,
    ],
    compare: msg`Switch Export to Current: Preview has no way out to export.`,
  },
  {
    id: "landing-compact",
    group: "landing",
    title: msg`Stage landing: one compact column`,
    changes: msg`On a stage that has never run, everything sits in one centered column with a sticky run bar; the sample preview only opens when you ask for it.`,
    variants: { landing: "compact" },
    path: `/pipeline/${FRESH}/sectioning`,
    steps: [
      msg`Use the states to visit a never-run stage, a locked stage and a stage that already has results.`,
      msg`On the never-run stage, the run bar stays visible above the dock while you scroll.`,
      msg`Press "Show an example of the result": the preview opens smoothly inside the column.`,
    ],
    lookFor: [
      msg`Is the stage still understandable without the big preview?`,
      msg`Does the sticky run bar feel helpful or in the way?`,
    ],
    compare: msg`Switch Stage landing to Action first or Current while on the same state.`,
  },
  {
    id: "features-add",
    group: "features",
    title: msg`Outputs: only what you add`,
    changes: msg`After setup the dock holds Extract and Sectioning plus an Outputs button. Optional outputs (captions, quizzes, translation, speech…) appear in the dock only once you add them. Simulated on a fresh-looking copy of "[Lab] Triste fim…".`,
    variants: { features: "add" },
    sim: FRESH_AFTER_SETUP,
    freshOutputs: true,
    path: `/pipeline/${DONE}/pages/pg008009`,
    steps: [
      msg`"Nothing added": the dock shows Extract, Sectioning and a highlighted Outputs button.`,
      msg`Open Outputs: every optional output is listed with a one-line description.`,
      msg`"Three added, not run yet": the dock shows the three outputs outlined in their colors.`,
      msg`Open one of them: its never-run setup page shows; nothing has run.`,
    ],
    lookFor: [
      msg`Is it obvious where the optional outputs went?`,
      msg`Do added-but-not-run outputs look different enough from finished ones?`,
    ],
    compare: msg`Switch Outputs to Current on the same state: every output sits in the dock from the start.`,
  },
  {
    id: "features-suggested",
    group: "features",
    title: msg`Outputs: suggested by who will read the book`,
    changes: msg`Like "Add when needed", plus a card after setup asking who will read the book; picking readers adds the matching outputs. Output names are reader-facing everywhere (Image descriptions, Read aloud, Languages, Accessibility check).`,
    variants: { features: "suggested" },
    sim: FRESH_AFTER_SETUP,
    freshOutputs: true,
    path: `/pipeline/${DONE}/pages/pg008009`,
    steps: [
      msg`"Reader card": the card asks "Who will read this book?" above the dock with six reader needs.`,
      msg`"Outputs added": the dock shows Image descriptions, Languages and Read aloud, not run yet.`,
      msg`"Image descriptions · never run", "running" and "just finished": the same output through its life, with the reader-facing names.`,
      msg`Pick some needs on the card and press Add: the toast names what was added and why Languages came along.`,
    ],
    lookFor: [
      msg`Is "Who will read this book?" the right question at this moment?`,
      msg`Do the reader-facing names work everywhere you look?`,
    ],
    compare: msg`Switch Outputs to "Add when needed" on the same state: no card, technical names.`,
  },
  {
    id: "loaders-content",
    group: "loaders",
    title: msg`Loading states: show content, not spinners`,
    changes: msg`Pages that are still being built show your PDF page with a scan passing over it; stage loads show the shape of the stage; placeholders keep the real cards' size. Simulated.`,
    variants: { loaders: "content" },
    sim: JOURNEY,
    freshOutputs: true,
    path: `/pipeline/${DONE}/pages/pg001`,
    steps: [
      msg`"Storyboard building": unbuilt pages show the PDF page with a scan and "Building page N".`,
      msg`"Rail while building": the rail keeps PDF thumbnails for pages not built yet.`,
      msg`"Stage loading (held)": the window reloads and the stage-shaped skeleton stays until you pick another state.`,
    ],
    lookFor: [
      msg`Does anything still feel like waiting on an empty screen?`,
    ],
    compare: msg`Switch Loading states to Current on the same state: spinners and blank thumbnails.`,
  },
]
