"""
Builds the "Your books" section of reports/e3-costs.html from results/app-e3-books (app-e3-books.ts output):
one card per book with its cover, name, size, and the picks of every run, cells that differ from the
book's most common pick highlighted. Covers are embedded as data URIs (the report is private; covers stay
out of git).
    python3 report-books.py            -> writes reports/e3-books-section.html
"""
import base64, collections, html, json, os

ROOT = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(ROOT, "results", "app-e3-books")
PRICES = {"gpt-5.4": (2.5, 15), "gpt-5.4-mini": (0.75, 4.5)}
MODELS = ["gpt-5.4-mini", "gpt-5.4"]

SETTING = [
    ("preset", "Kind of book", {"storybook": "Story", "textbook": "School book", "reference": "Information"}),
    ("renderStrategy", "Page layout", {"llm": "Rebuilt to fit", "llm-overlay": "Page + words on top", "single_column": "One column", "two_column_story": "Picture beside words", "fixed_layout": "Keep printed page"}),
    ("pageGrouping", "Two-page pictures", {"single": "One page per screen", "spread": "Join facing pages"}),
    ("figureExtraction", "Labelled drawings", {"auto": "Keep with labels", "off": "Not needed"}),
    ("activitiesGenerator", "Activities", {True: "On", False: "Off"}),
    ("sectioningMode", "Page split", {"page": "Whole page", "dynamic": "Reading + tasks"}),
]
DEPENDS = {"preset": ["genre"], "renderStrategy": ["genre", "composition"], "pageGrouping": [], "figureExtraction": ["diagrams"],
           "activitiesGenerator": ["genre", "exercises"], "sectioningMode": ["genre", "exercises", "composition"], "range": []}
FACT = {"genre": "kind of book", "exercises": "exercises", "composition": "where words sit", "diagrams": "labelled pictures"}
TEXT_LAYER = {"digital": "real text", "scanned": "scan, no text", "scanned-with-ocr": "scan with hidden text", "mixed": "some pages scanned"}


def esc(s):
    return html.escape(str(s))


def rng(r):
    p = r.get("pageRange")
    if not p or not p["skipped"]:
        return "All pages"
    return f"Pages {p['start']}–{p['end']}"


def cost(model, u):
    i, o = PRICES[model]
    return (u["inputTokens"] * i + u["outputTokens"] * o) / 1e6


def main():
    index = json.load(open(os.path.join(RES, "index.json")))
    cards, summary = [], []
    for b in index:
        if b.get("error"):
            summary.append(f"<tr><td>{esc(b['file'])}</td><td colspan='5'>Could not be read: {esc(b['error'][:120])}</td></tr>")
            continue
        runs = []
        for m in MODELS:
            for n in (1, 2, 3):
                f = os.path.join(RES, f"{b['id']}.{m}.run{n}.json")
                runs.append((m, n, json.load(open(f)) if os.path.exists(f) else None))
        ok = [r for r in runs if r[2]]
        if not ok:
            continue
        rows = [(key, label, words) for key, label, words in SETTING] + [("range", "Pages to import", None)]

        def val(rec, key):
            return rng(rec) if key == "range" else rec["settings"][key]["value"]

        # Consistency: per model, settings identical in all its runs; across models, same majority pick.
        stable = {}
        for m in MODELS:
            rs = [r for mm, _, r in ok if mm == m]
            stable[m] = sum(1 for key, *_ in rows if len({json.dumps(val(r, key)) for r in rs}) == 1) if rs else None
        # Each model's runs are compared with that model's own most common pick: run-to-run consistency.
        majority = {
            (m, key): collections.Counter(json.dumps(val(r, key)) for mm, _, r in ok if mm == m).most_common(1)[0][0]
            for m in MODELS if any(mm == m for mm, _, _ in ok) for key, *_ in rows
        }
        models_agree = sum(1 for key, *_ in rows if majority.get(("gpt-5.4-mini", key)) == majority.get(("gpt-5.4", key)))

        silent = [0]
        head = "".join(f"<th class='c'>{'mini' if m == 'gpt-5.4-mini' else '5.4'} · {n}</th>" for m, n, _ in runs)
        body = []
        for key, label, words in rows:
            cells = []
            for m, n, r in runs:
                if not r:
                    cells.append("<td class='c miss'>–</td>")
                    continue
                v = val(r, key)
                shown = v if key == "range" else words.get(v, str(v))
                odd = json.dumps(v) != majority[(m, key)]
                asked = {f["id"] for f in r["facts"] if f["ask"]}
                silent_cell = odd and not (set(DEPENDS[key]) & asked)
                if silent_cell:
                    silent[0] += 1
                cls = " odd silent" if silent_cell else " odd" if odd else ""
                cells.append(f"<td class='c{cls}'>{esc(shown)}{' *' if silent_cell else ''}</td>")
            lock = " (fixed)" if key in ("pageGrouping", "figureExtraction", "range") else ""
            body.append(f"<tr><th>{esc(label)}{lock}</th>{''.join(cells)}</tr>")
        asked_cells = []
        for m, n, r in runs:
            if not r:
                asked_cells.append("<td class='c miss'>–</td>")
                continue
            a = [FACT[f["id"]] for f in r["facts"] if f["ask"]]
            asked_cells.append(f"<td class='c ask'>{esc(', '.join(a)) if a else 'none'}</td>")
        body.append(f"<tr><th>Asks the user</th>{''.join(asked_cells)}</tr>")
        body.append("<tr><th>Time · cost</th>" + "".join(
            f"<td class='c meta'>{r['timings']['totalMs'] / 1000:.1f} s · {cost(m, r['usage']) * 100:.2f}¢</td>" if r else "<td class='c miss'>–</td>"
            for m, n, r in runs) + "</tr>")

        first = ok[0][2]
        cover = os.path.join(RES, "covers", f"{b['id']}.jpg")
        img = f"<img src='data:image/jpeg;base64,{base64.b64encode(open(cover, 'rb').read()).decode()}' alt='Cover of {esc(b['file'])}'>" if os.path.exists(cover) else ""
        reasons = []
        for f in first["facts"]:
            if f.get("reason"):
                reasons.append(f"<li><b>{esc(FACT[f['id']].capitalize())}:</b> {esc(f['reason'])}</li>")
        n_settings = len(rows)
        badge = lambda m: (
            "<span class='pill'>same in all 3 runs</span>" if stable[m] == n_settings
            else f"<span class='pill w'>{n_settings - stable[m]} of {n_settings} picks changed</span>" if stable[m] is not None else ""
        )
        cards.append(f"""
      <article class="book">
        <div class="cover">{img}</div>
        <div class="bookbody">
          <h3>{esc(b['file'][:-4])}</h3>
          <p class="meta">{b['pages']} pages · {b['sizeMB']} MB · {TEXT_LAYER.get(first['measured']['textLayer'], '')} · scan {b['scanMs'] / 1000:.1f} s</p>
          <p class="meta">gpt-5.4-mini {badge('gpt-5.4-mini')} &nbsp; gpt-5.4 {badge('gpt-5.4')}</p>
          <div class="tablewrap"><table class="runs"><thead><tr><th></th>{head}</tr></thead><tbody>{''.join(body)}</tbody></table></div>
          <details><summary>What the AI said about this book (gpt-5.4-mini, run 1)</summary><ul class="plain">{''.join(reasons)}</ul></details>
        </div>
      </article>""")
        summary.append(
            f"<tr><td>{esc(b['file'][:-4][:60])}</td><td class='r'>{b['pages']}</td>"
            f"<td class='r'>{stable['gpt-5.4-mini']}/{n_settings}</td><td class='r'>{stable['gpt-5.4']}/{n_settings}</td>"
            f"<td class='r'>{sum(1 for _, _, r in ok if any(f['ask'] for f in r['facts']))}/{len(ok)}</td><td class='r'>{models_agree}/{n_settings}</td><td class='r'>{'<span class="pill w">' + str(silent[0]) + '</span>' if silent[0] else '<span class="pill">0</span>'}</td>"
            f"<td class='r'>{sum(r['timings']['totalMs'] for _, _, r in ok) / len(ok) / 1000:.1f} s</td></tr>")

    section = f"""
  <section id="your-books">
    <span class="eyebrow">Your books</span>
    <h2>Auto mode on your 14 books, 3 runs per model</h2>
    <p class="find">Each book from your PDF folder ran 3 times with gpt-5.4-mini and 3 times with gpt-5.4, every run a fresh AI call with no cache. A highlighted cell is a pick that differs from what that model picked in its other runs on the book, so a book with no highlights got the same settings every time. A star (*) marks a highlighted pick in a run that did not ask the user about it: the change would have gone through unnoticed. These books have no answer key: check the picks against the covers.</p>
    <div class="tiles">
      <div class="tile"><span class="k">Settings that changed between runs</span><span class="v">9 <small>of 504</small></span><span class="n">7 of the 9 came with a question to the user</span></div>
      <div class="tile"><span class="k">Pages to import that changed</span><span class="v">10 <small>of 84</small></span><span class="n">never asked: the weak spot</span></div>
      <div class="tile"><span class="k">Picks identical in all 3 runs</span><span class="v">94% <small>gpt-5.4</small></span><span class="n">89% with gpt-5.4-mini (98 picks each)</span></div>
      <div class="tile"><span class="k">Time on these books, median</span><span class="v">6.2 s <small>mini</small></span><span class="n">10.4 s gpt-5.4; up to 26 to 31 s on a 129 MB book</span></div>
    </div>
    <div class="panel">
      <h3>What the runs show</h3>
      <ul class="plain">
        <li><b>The six settings are predictable.</b> Across 84 runs, a setting changed 9 times out of 504. In 7 of those the user was asked about the fact behind it, so a person would have decided. Two changes would have gone through unnoticed: the layout of Capítulo 01 in one gpt-5.4 run, and the labelled-drawings setting of El Viaje in one mini run.</li>
        <li><b>Pictures across two pages never changed</b>: it is measured, not guessed. Only colouring-my-school joins facing pages.</li>
        <li><b>The pages to import are not predictable yet.</b> The first page moved by 1 to 7 pages between runs on 5 books (colouring-my-school 2 or 9, triste 9, 10 or 14), and the user is never asked. On long books the end always stops 4 pages early, because the last 4 pages are the only ones read there. Fix before testing with people: show the range as a question when it moves, or read the pages around each boundary a second time.</li>
        <li><b>gpt-5.4 is steadier than mini on hard books.</b> On The Elements of Computing Systems, mini said "information" once and "school book" twice (and asked each time); gpt-5.4 said school book in all 3 runs. On these 14 books gpt-5.4 kept 94% of picks identical, mini 89%.</li>
        <li><b>Real books are slower and dearer than the 7 to 12 page excerpts.</b> Average cost per book 1.42¢ with mini (max 1.98¢) and 4.75¢ with gpt-5.4 (max 6.59¢). The scan of the 212-page, 129 MB Práticas Vol. II took 19 s, most of its 26 s: big scanned-picture PDFs make the scan, not the AI, the slow part.</li>
      </ul>
    </div>
    <div class="panel"><div class="tablewrap"><table>
      <thead><tr><th>Book</th><th class="r">Pages</th><th class="r">Same picks, mini</th><th class="r">Same picks, gpt-5.4</th><th class="r">Runs that ask</th><th class="r">Models agree</th><th class="r">Changed without asking</th><th class="r">Avg time</th></tr></thead>
      <tbody>{''.join(summary)}</tbody></table></div>
      <p class="note">"Same picks" counts the 7 picks (6 settings and the pages to import) that came out identical in all 3 runs of that model. Time includes the scan, which reads every page.</p>
    </div>
    <div class="books">{''.join(cards)}
    </div>
  </section>
"""
    open(os.path.join(ROOT, "reports", "e3-books-section.html"), "w").write(section)
    print(f"{len(cards)} book cards")


main()
