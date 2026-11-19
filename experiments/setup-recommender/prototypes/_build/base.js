/* Shared by every prototype. DATA is inlined by build.py. */
const $ = (s, el = document) => el.querySelector(s)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

const ICON = {
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
  flag: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 8.5 3 3 7-7"/></svg>',
  later: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.5H5"/></svg>',
  sun: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/></svg>',
  moon: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>',
}
const lockBadge = (t = "Fixed at import") => `<span class="badge lock">${ICON.lock}${t}</span>`
const laterBadge = (t = "Can change later") => `<span class="badge later">${ICON.later}${t}</span>`
const flagBadge = (t = "Two readings disagree") => `<span class="badge flag">${ICON.flag}${t}</span>`

/* ---- facts the AI answers, in plain words ---- */
const FACTS = {
  genre: {
    q: "What kind of book is it?",
    opts: { story: ["A story", "Characters and a plot: picture books, novels"], textbook: ["A textbook", "Teaches with lessons, often with exercises"], reference: ["Reference", "Information to read or look up: reports, papers"] },
  },
  exercises: {
    q: "Does it ask the reader to do things?",
    opts: { none: ["No", "Nothing to answer or fill in"], some: ["A few", "Some questions or tasks"], many: ["Yes, many", "Questions, blanks, tasks on most pages"] },
  },
  composition: {
    q: "Where does the text sit?",
    opts: { "text-in-art": ["On the pictures", "Words are part of the artwork"], "text-beside-art": ["Beside the pictures", "Picture in one area, text in another"], "text-mostly": ["Mostly text", "Few pictures"] },
  },
  diagrams: {
    q: "Are there diagrams, maps or charts with labels?",
    opts: { none: ["No", "Only illustrations or photos"], some: ["A few", "One or two labelled figures"], many: ["Many", "Labelled figures throughout"] },
  },
}
const FACT_ORDER = ["genre", "exercises", "composition", "diagrams"]

/* ---- settings ---- */
const SETTINGS = {
  pageGrouping: { name: "Page grouping", locked: true, vals: { single: "One page per screen", spread: "Facing pages as one screen" } },
  figureExtraction: { name: "Diagrams", locked: true, vals: { off: "Off", auto: "Keep labelled diagrams together", all: "Group every image with its text" } },
  preset: { name: "Preset", vals: { storybook: "Storybook", textbook: "Textbook", reference: "Reference" } },
  renderStrategy: { name: "Layout", vals: { llm: "AI rebuilds the layout", "llm-overlay": "AI text over the art", single_column: "One clean column", two_column_story: "Picture beside text", fixed_layout: "Keep the original page" } },
  sectioningMode: { name: "Sections", vals: { page: "One section per page", dynamic: "Split pages into parts" } },
  activitiesGenerator: { name: "Activities", vals: { enabled: "Turn exercises into activities", disabled: "Off" } },
}
const SETTING_ORDER = ["pageGrouping", "figureExtraction", "preset", "renderStrategy", "sectioningMode", "activitiesGenerator"]
const LOCKED = SETTING_ORDER.filter((k) => SETTINGS[k].locked)
const CHEAP = SETTING_ORDER.filter((k) => !SETTINGS[k].locked)

/* port of rules.ts decide() — same facts, same settings */
function decide(d, s) {
  const preset = { story: "storybook", textbook: "textbook", reference: "reference" }[s.genre]
  const pageGrouping = d.pageStorage.value === "spreads-as-separate-pages"
    ? { value: "spread", rule: "Facing pages continue across the fold, so each pair is joined into one screen." }
    : { value: "single", rule: d.pageStorage.value === "spreads-as-wide-pages" ? "Spreads are already stored as one wide page." : "Pages stand alone." }
  const hasText = d.textLayer.value === "digital"
  let renderStrategy
  if (preset === "reference") renderStrategy = { value: "single_column", rule: "Reference material reads best as one clean column." }
  else if (preset === "textbook") renderStrategy = { value: "llm", rule: "Lessons and exercises need the AI layout to rebuild their structure." }
  else if (s.composition === "text-in-art") renderStrategy = hasText ? { value: "fixed_layout", rule: "Text is placed on the pictures, so the original page design is kept." } : { value: "llm-overlay", rule: "Text is on the pictures but the PDF has no real text, so the AI rebuilds it over the art." }
  else if (s.composition === "text-beside-art") renderStrategy = { value: "two_column_story", rule: "Text sits beside the pictures, so story text and art go side by side." }
  else renderStrategy = { value: "llm", rule: "Mostly text, so the AI layout reflows it." }
  const ex = s.exercises !== "none"
  const activitiesGenerator = preset === "textbook" && ex ? { value: "enabled", rule: "The book has exercises, so they become interactive activities." } : { value: "disabled", rule: ex ? "Activities are only made in the Textbook preset." : "No exercises for the reader." }
  const sectioningMode = preset === "textbook" && ex && renderStrategy.value !== "fixed_layout" ? { value: "dynamic", rule: "Pages mix reading and exercises, so each page is split into parts." } : { value: "page", rule: "Each page is one unit." }
  const figureExtraction = hasText && (s.diagrams !== "none" || d.vectorDiagrams.value) ? { value: "auto", rule: "Diagrams with text labels are kept together as figures." } : { value: "off", rule: hasText ? "No labelled diagrams." : "Without real text there are no labels to group." }
  return { preset: { value: preset, rule: `The book is ${s.genre === "reference" ? "reference material" : "a " + s.genre}.` }, renderStrategy, pageGrouping, sectioningMode, activitiesGenerator, figureExtraction }
}

/* which facts a setting listens to (for "this changes …" hints) */
const FEEDS = { preset: ["genre"], renderStrategy: ["genre", "composition"], sectioningMode: ["genre", "exercises"], activitiesGenerator: ["genre", "exercises"], figureExtraction: ["diagrams"], pageGrouping: [] }

/* ---- book helpers ---- */
const bookById = (id) => DATA.books.find((b) => b.id === id) || DATA.books[0]
const img = (b, p) => `../pages/${b.id}/p${p}.jpg`
const aiFacts = (b) => Object.fromEntries(FACT_ORDER.map((k) => [k, b.readingA[k].answer]))
const isTrue = (b, k, v) => (b.truth[k] || []).includes(v)
const langName = (c) => ({ es: "Spanish", en: "English", pt: "Portuguese" })[c] || c

/* Where reading A (one call, whole book) and reading B (page-by-page labels) disagree.
   matters = picking one or the other changes at least one setting. */
function disagreements(b) {
  const A = aiFacts(b), Bs = b.readingB.semantic
  return FACT_ORDER.filter((k) => A[k] !== Bs[k]).map((k) => {
    const sa = decide(b.measured, A), sb = decide(b.measured, { ...A, [k]: Bs[k] })
    const changes = SETTING_ORDER.filter((s) => sa[s].value !== sb[s].value)
    return { fact: k, a: A[k], b: Bs[k], changes, matters: changes.length > 0 }
  })
}

/* What the page-by-page reading saw, as a short sentence */
function readingBSummary(b) {
  const c = {}
  for (const p of b.readingB.pages) c[p.type] = (c[p.type] || 0) + 1
  const names = { cover: "cover", "front-matter": "front matter", "back-matter": "back matter", blank: "blank", story: "story", lesson: "lesson", exercise: "exercise", informational: "information" }
  return Object.entries(c).map(([t, n]) => `${n} ${names[t] || t}`).join(" · ")
}

function spreadPairs(b) {
  const e = b.measured.pageStorage.evidence || []
  const out = []
  for (let i = 0; i + 1 < e.length; i += 2) out.push([e[i], e[i + 1]].sort((x, y) => x - y))
  return out.sort((x, y) => x[0] - y[0])
}

function measuredLine(b) {
  const m = b.measured
  return `${b.pageCount} pages · ${langName(m.language.guess)} · ${m.textLayer.value === "digital" ? "real text" : "scanned"}`
}

/* evidence for a locked setting, as HTML */
function lockedEvidence(b, key, sem) {
  const m = b.measured
  if (key === "pageGrouping") {
    const pairs = spreadPairs(b)
    if (m.pageStorage.value === "spreads-as-separate-pages")
      return { text: `Measured: ${m.pageStorage.detail.replace("gutter", "fold")}.`, html: `<div class="row wrapflex">${pairs.slice(0, 2).map(([x, y]) => `<button class="spreadpair" data-zoom="${x}"><img src="${img(b, x)}" alt="Page ${x}"><img src="${img(b, y)}" alt="Page ${y}"></button>`).join("")}</div>` }
    if (m.pageStorage.value === "spreads-as-wide-pages")
      return { text: `Measured: every page is landscape, so each page already holds a full spread.`, html: thumbs(b, [2, 3]) }
    return { text: `Measured: ${m.pageStorage.detail.replace("gutter", "fold")}. Each page stands alone.`, html: thumbs(b, [2, 3]) }
  }
  if (key === "figureExtraction") {
    const v = m.vectorDiagrams
    const t = sem.diagrams === "none" && !v.value ? `No labelled diagrams found.` : `Labelled figures: the AI says “${FACTS.diagrams.opts[sem.diagrams][0].toLowerCase()}”, the PDF has drawn diagrams on ${v.pagesWithDiagrams} page${v.pagesWithDiagrams === 1 ? "" : "s"}.`
    const pages = (b.readingA.diagrams.evidencePages || []).slice(0, 3)
    return { text: t, html: sem.diagrams !== "none" ? thumbs(b, pages) : "" }
  }
  return { text: "", html: "" }
}

function thumbs(b, pages, cited = []) {
  return `<div class="thumbs">${pages.map((p) => `<button class="thumb ${cited.includes(p) ? "cited" : ""}" data-zoom="${p}" aria-label="Open page ${p}"><img src="${img(b, p)}" alt="" loading="lazy"><span class="pn">p${p}</span></button>`).join("")}</div>`
}

/* ---- chrome ---- */
function setupTheme() {
  const btn = $("#theme")
  if (!btn) return
  const paint = () => { const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; btn.innerHTML = dark ? ICON.sun : ICON.moon; btn.title = dark ? "Light" : "Dark" }
  btn.onclick = () => { const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; document.documentElement.dataset.theme = dark ? "light" : "dark"; paint() }
  const t = new URLSearchParams(location.search).get("theme")
  if (t) document.documentElement.dataset.theme = t
  paint()
}

function renderBookTabs(current, onPick) {
  const el = $("#books")
  el.innerHTML = DATA.books.map((b) => `<button class="bookbtn" aria-pressed="${b.id === current}" data-book="${b.id}"><img src="${img(b, 1)}" alt="">${esc(b.short)}${disagreements(b).some((d) => d.matters) ? '<span class="wrongdot" title="AI likely wrong here"></span>' : ""}</button>`).join("")
  el.onclick = (e) => { const t = e.target.closest("[data-book]"); if (t) onPick(t.dataset.book) }
}

function setupLightbox(getBook) {
  const lb = document.createElement("div")
  lb.className = "lightbox"
  lb.innerHTML = `<div><img alt=""><div class="cap"></div></div>`
  document.body.appendChild(lb)
  lb.onclick = () => lb.classList.remove("open")
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-zoom]")
    if (!t) return
    const b = getBook(), p = +t.dataset.zoom
    $("img", lb).src = img(b, p)
    $(".cap", lb).textContent = `${b.title} · page ${p}`
    lb.classList.add("open")
  })
}

function params() { return new URLSearchParams(location.search) }
function setParam(k, v) { const u = new URL(location.href); v == null ? u.searchParams.delete(k) : u.searchParams.set(k, v); history.replaceState(null, "", u) }
