// Review controls for the "Your books" section. Feedback lives in the artifact database (collection
// "review") so Claude can read it back with ArtifactData and answer in each doc's `reply` field.
// Docs: book-<slug> {kind, book, correct:{setting: json value, rangeStart, rangeEnd}, note, reply?},
// finding-<id> {kind, verdict, note, reply?}, general {kind, note, reply?}.
(function () {
  const META = JSON.parse(document.getElementById("reviewMeta").textContent)
  const BOOK = Object.fromEntries(META.books.map((b) => [b.id, b]))
  const ROUND = 1
  const state = {}
  const pending = {}
  const inflight = {}
  let db = null
  const globalStatus = document.getElementById("reviewStatus")

  const blockFor = (id) =>
    id.startsWith("book-") ? document.querySelector(`.check[data-book="${CSS.escape(id.slice(5))}"]`)
    : id.startsWith("finding-") ? document.querySelector(`.fb[data-finding="${CSS.escape(id.slice(8))}"]`)
    : document.getElementById("review")
  function setStatus(id, text, err) {
    const el = id === "general" ? globalStatus : blockFor(id)?.querySelector(".status")
    if (!el) return
    el.textContent = text
    el.classList.toggle("err", !!err)
  }

  // ---- saving: one write at a time per doc, coalesced ----
  function schedule(id, delay) {
    clearTimeout(pending[id])
    setStatus(id, db ? "Saving…" : "Not saved")
    pending[id] = setTimeout(() => save(id), delay)
  }
  function save(id) {
    delete pending[id]
    if (!db) return setStatus(id, "Not saved: open this page on claude.ai, signed in", true)
    if (inflight[id]) return void inflight[id].then(() => schedule(id, 0))
    const body = { ...state[id], round: ROUND, updatedAt: new Date().toISOString() }
    inflight[id] = db.doc("review/" + id).set(body)
      .then(() => setStatus(id, "Saved"), (e) => setStatus(id, "Not saved (" + ((e && e.code) || "error") + ")", true))
      .finally(() => { delete inflight[id] })
  }

  // ---- books ----
  const bookId = (slug) => "book-" + slug
  function bookState(slug) {
    const id = bookId(slug)
    return state[id] || (state[id] = { kind: "book", book: slug, title: BOOK[slug].title, correct: {}, note: "" })
  }
  function correctRange(slug) {
    const c = bookState(slug).correct
    const s = Number(c.rangeStart), e = Number(c.rangeEnd)
    if (!s || !e) return null
    return JSON.stringify(s === 1 && e === BOOK[slug].pages ? "all" : `${s}-${e}`)
  }
  function markBook(slug) {
    const card = document.querySelector(`.check[data-book="${CSS.escape(slug)}"]`).closest(".book")
    const c = bookState(slug).correct
    card.querySelectorAll("td[data-k]").forEach((td) => {
      const want = td.dataset.k === "range" ? correctRange(slug) : c[td.dataset.k] || null
      td.classList.toggle("right", !!want && td.dataset.v === want)
      td.classList.toggle("wrong", !!want && td.dataset.v !== want)
    })
  }
  function fillBook(slug) {
    const block = document.querySelector(`.check[data-book="${CSS.escape(slug)}"]`)
    const st = bookState(slug)
    block.querySelectorAll("[data-field]").forEach((el) => {
      const f = el.dataset.field
      const v = f === "note" ? st.note : st.correct[f]
      el.value = v == null ? "" : String(v)
    })
    showReply(block.querySelector(".reply"), st.reply)
    markBook(slug)
  }
  document.querySelectorAll(".check[data-book]").forEach((block) => {
    const slug = block.dataset.book
    block.addEventListener("input", (ev) => {
      const el = ev.target.closest("[data-field]")
      if (!el) return
      const st = bookState(slug)
      const f = el.dataset.field
      if (f === "note") st.note = el.value
      else if (f === "rangeStart" || f === "rangeEnd") st.correct[f] = el.value ? Number(el.value) : null
      else st.correct[f] = el.value || null
      markBook(slug)
      renderScore()
      schedule(bookId(slug), el.tagName === "SELECT" ? 0 : 900)
    })
    block.querySelector("[data-fill]").addEventListener("click", (ev) => {
      const m = ev.currentTarget.dataset.fill
      const maj = BOOK[slug].maj[m]
      if (!maj) return
      const st = bookState(slug)
      for (const [k, v] of Object.entries(maj)) {
        if (k === "range") {
          const [s, e] = v === "all" ? [1, BOOK[slug].pages] : v.split("-").map(Number)
          st.correct.rangeStart = s
          st.correct.rangeEnd = e
        } else st.correct[k] = JSON.stringify(v)
      }
      fillBook(slug)
      renderScore()
      schedule(bookId(slug), 0)
    })
  })

  // ---- findings ----
  document.querySelectorAll("li[data-finding]").forEach((li) => {
    const fid = li.dataset.finding
    const box = document.createElement("div")
    box.className = "fb"
    box.dataset.finding = fid
    box.innerHTML =
      '<div class="verdicts"><button type="button" data-verdict="agree" aria-pressed="false">Agree</button>' +
      '<button type="button" data-verdict="disagree" aria-pressed="false">Disagree</button>' +
      '<button type="button" data-verdict="unsure" aria-pressed="false">Not sure</button><span class="status" aria-live="polite"></span></div>' +
      '<label><span class="sr">Note on this finding</span><textarea rows="2" placeholder="Why? What did you see?"></textarea></label><div class="reply" hidden></div>'
    li.appendChild(box)
    const id = "finding-" + fid
    const st = () => state[id] || (state[id] = { kind: "finding", finding: fid, verdict: null, note: "" })
    box.querySelectorAll("[data-verdict]").forEach((b) => b.addEventListener("click", () => {
      st().verdict = st().verdict === b.dataset.verdict ? null : b.dataset.verdict
      fillFinding(fid)
      renderScore()
      schedule(id, 0)
    }))
    box.querySelector("textarea").addEventListener("input", (ev) => { st().note = ev.target.value; schedule(id, 900) })
  })
  function fillFinding(fid) {
    const box = document.querySelector(`.fb[data-finding="${CSS.escape(fid)}"]`)
    const s = state["finding-" + fid] || {}
    box.querySelectorAll("[data-verdict]").forEach((b) => b.setAttribute("aria-pressed", String(s.verdict === b.dataset.verdict)))
    box.querySelector("textarea").value = s.note || ""
    showReply(box.querySelector(".reply"), s.reply)
  }

  // ---- general ----
  const general = document.querySelector("textarea[data-general]")
  general.addEventListener("input", () => {
    state.general = { ...(state.general || { kind: "general" }), note: general.value }
    schedule("general", 900)
  })

  function showReply(el, text) {
    el.hidden = !text
    el.textContent = ""
    if (!text) return
    const b = document.createElement("b")
    b.textContent = "Claude: "
    el.append(b, document.createTextNode(String(text)))
  }

  // ---- score ----
  function renderScore() {
    const models = ["gpt-5.4-mini", "gpt-5.4"]
    const acc = Object.fromEntries(models.map((m) => [m, { set: 0, right: 0, asked: 0, silent: 0, rset: 0, rright: 0 }]))
    let booksChecked = 0
    for (const slug of Object.keys(BOOK)) {
      const c = bookState(slug).correct
      const want = (k) => (k === "range" ? correctRange(slug) : c[k] || null)
      if (!META.settings.some((k) => want(k))) continue
      booksChecked++
      const card = document.querySelector(`.check[data-book="${CSS.escape(slug)}"]`).closest(".book")
      card.querySelectorAll("td[data-k]").forEach((td) => {
        const w = want(td.dataset.k)
        if (!w) return
        const a = acc[td.dataset.m]
        const ok = td.dataset.v === w
        if (td.dataset.k === "range") { a.rset++; if (ok) a.rright++; return }
        a.set++
        if (ok) a.right++
        else if (td.dataset.asked === "1") a.asked++
        else a.silent++
      })
    }
    const pct = (n, d) => (d ? Math.round((100 * n) / d) + "%" : "–")
    const findings = Object.values(state).filter((s) => s.kind === "finding" && s.verdict)
    document.getElementById("score").innerHTML =
      `<thead><tr><th>Model</th><th class="r">Settings right</th><th class="r">Wrong, but the user was asked</th><th class="r">Wrong and not asked</th><th class="r">Pages to import right</th></tr></thead><tbody>` +
      models.map((m) => { const a = acc[m]; return `<tr><td>${m}</td><td class="r">${a.right}/${a.set} · ${pct(a.right, a.set)}</td><td class="r">${a.asked}</td><td class="r${a.silent ? " bad" : ""}">${a.silent}</td><td class="r">${a.rright}/${a.rset} · ${pct(a.rright, a.rset)}</td></tr>` }).join("") +
      `</tbody><caption class="note" style="caption-side:bottom;text-align:left;padding-top:6px">${booksChecked} of ${META.books.length} books checked · ${findings.length} of 5 findings answered. Counts every run (3 per model per book) against your answers.</caption>`
  }

  // ---- load ----
  for (const slug of Object.keys(BOOK)) fillBook(slug)
  renderScore()
  const timer = setTimeout(() => { globalStatus.textContent = "Can't reach saved feedback yet"; globalStatus.classList.add("err") }, 10000)
  ;(window.claude ? window.claude.use("db") : Promise.resolve(null)).then((d) => {
    db = d
    if (!db) {
      clearTimeout(timer)
      globalStatus.textContent = "Saving is off here: open this page on claude.ai, signed in"
      globalStatus.classList.add("err")
      return
    }
    db.collection("review").onSnapshot((snap) => {
      if (!snap.metadata.fromCache) { clearTimeout(timer); globalStatus.classList.remove("err"); globalStatus.textContent = "Saved feedback loaded" }
      for (const doc of snap.docs) {
        const id = doc.id
        if (pending[id] || inflight[id]) continue
        const block = blockFor(id)
        if (block && block.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA") continue
        const data = structuredClone(doc.data() || {})
        if (id.startsWith("book-") && BOOK[id.slice(5)]) { state[id] = { ...bookState(id.slice(5)), ...data, correct: { ...(data.correct || {}) } }; fillBook(id.slice(5)) }
        else if (id.startsWith("finding-") && document.querySelector(`.fb[data-finding="${CSS.escape(id.slice(8))}"]`)) { state[id] = data; fillFinding(id.slice(8)) }
        else if (id === "general") { state.general = data; general.value = data.note || ""; showReply(document.getElementById("generalReply"), data.reply) }
      }
      renderScore()
    }, (e) => { clearTimeout(timer); globalStatus.textContent = "Saved feedback unavailable (" + ((e && e.code) || "error") + ")"; globalStatus.classList.add("err") })
  }, () => { clearTimeout(timer); globalStatus.textContent = "Saving is off here"; globalStatus.classList.add("err") })
})()
