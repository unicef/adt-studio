"""
Builds the "Your books" section of reports/e3-costs.html from results/app-e3-books (app-e3-books.ts output):
one card per book with its cover, name, size, and the picks of every run, cells that differ from the
book's most common pick highlighted. Covers are embedded as data URIs (the report is private; covers stay
out of git).
    python3 report-books.py [round]   -> writes reports/e3-books-section.html
Round N reads results/app-e3-books-rN (round 1: results/app-e3-books), scores every run against the
user's answers in results/feedback/round1.json, and compares with the round before. The findings text
for the round is in reports/findings-roundN.html.
"""
import base64, collections, html, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ROUND = int(sys.argv[1]) if len(sys.argv) > 1 else 2
res_dir = lambda n: os.path.join(ROOT, "results", "app-e3-books" if n == 1 else f"app-e3-books-r{n}")
RES = res_dir(ROUND)
KEY = json.load(open(os.path.join(ROOT, "results", "feedback", "round1.json")))
PRICES = {"gpt-5.4": (2.5, 15), "gpt-5.4-mini": (0.75, 4.5)}
MODELS = ["gpt-5.4-mini", "gpt-5.4"]

SETTING = [
    ("preset", "Preset", {"storybook": "Storybook", "textbook": "Textbooks & Activities", "reference": "Reference"}),
    ("renderStrategy", "Render Strategy", {"llm": "Dynamic", "llm-overlay": "Dynamic Overlay", "single_column": "Single Column", "two_column_story": "Two Columns Story", "fixed_layout": "Fixed Layout"}),
    ("pageGrouping", "Page Grouping", {"single": "Single Page", "spread": "Spread"}),
    ("figureExtraction", "Figure Extraction", {"auto": "Auto", "off": "Off"}),
    ("activitiesGenerator", "Activities", {True: "On", False: "Off"}),
    ("sectioningMode", "Sectioning", {"page": "Per Page", "dynamic": "Dynamic"}),
]
DEPENDS = {"preset": ["genre"], "renderStrategy": ["genre", "composition"], "pageGrouping": [], "figureExtraction": ["diagrams"],
           "activitiesGenerator": ["genre", "exercises"], "sectioningMode": ["genre", "exercises", "composition"]}
FACT = {"genre": "kind of book", "exercises": "exercises", "composition": "where words sit", "diagrams": "labelled pictures"}
TEXT_LAYER = {"digital": "real text", "scanned": "scan, no text", "scanned-with-ocr": "scan with hidden text", "mixed": "some pages scanned"}


def esc(s):
    return html.escape(str(s))


def wanted(book, key):
    """The user's answers for a setting: a list of accepted values, or None when not given."""
    a = KEY.get(book, {})
    if key in a:
        return [a[key]]
    return a.get("_accept", {}).get(key)


def score(n):
    """Every run of round n against the user's answers, per model."""
    out = {m: collections.Counter() for m in MODELS}
    for book in KEY:
        for m in MODELS:
            for run in (1, 2, 3):
                f = os.path.join(res_dir(n), f"{book}.{m}.run{run}.json")
                if not os.path.exists(f):
                    continue
                r = json.load(open(f))
                asked = {x["id"] for x in r["facts"] if x["ask"]}
                for key, *_ in SETTING:
                    w = wanted(book, key)
                    if w is None:
                        continue
                    c = out[m]
                    c["n"] += 1
                    if r["settings"][key]["value"] in w:
                        c["ok"] += 1
                    elif set(DEPENDS[key]) & asked:
                        c["asked"] += 1
                    else:
                        c["silent"] += 1
                        c["silent:" + key] += 1
    return out


def cost(model, u):
    i, o = PRICES[model]
    return (u["inputTokens"] * i + u["outputTokens"] * o) / 1e6


def main():
    index = json.load(open(os.path.join(RES, "index.json")))
    cards, summary, books_meta = [], [], []
    changed = collections.Counter()
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
        rows = list(SETTING)

        def val(rec, key):
            return rec["settings"][key]["value"]

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
                shown = words.get(v, str(v))
                odd = json.dumps(v) != majority[(m, key)]
                asked = {f["id"] for f in r["facts"] if f["ask"]}
                silent_cell = odd and not (set(DEPENDS[key]) & asked)
                if silent_cell:
                    silent[0] += 1
                changed["cells"] += 1
                changed["odd"] += odd
                changed["odd_silent"] += silent_cell
                cls = " odd silent" if silent_cell else " odd" if odd else ""
                was_asked = 1 if set(DEPENDS[key]) & asked else 0
                cells.append(f"<td class='c{cls}' data-k='{key}' data-m='{m}' data-v='{esc(json.dumps(v))}' data-asked='{was_asked}'>{esc(shown)}{' *' if silent_cell else ''}</td>")
            lock = " (fixed)" if key in ("pageGrouping", "figureExtraction") else ""
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
        maj = {m: {key: json.loads(majority[(m, key)]) for key, *_ in rows} for m in MODELS if (m, "preset") in majority}
        books_meta.append({"id": b["id"], "title": b["file"][:-4], "pages": b["pages"], "maj": maj})
        selects = "".join(
            f"<label><span>{esc(label)}</span><select data-field='{key}'><option value=''>Not checked</option>"
            + "".join(f"<option value='{esc(json.dumps(v))}'>{esc(w)}</option>" for v, w in words.items())
            + "</select></label>"
            for key, label, words in SETTING)
        check = f"""
          <div class="check" data-book="{b['id']}" data-pages="{b['pages']}">
            <div class="checkhead"><h4>Your check</h4><button type="button" class="ghost" data-fill="gpt-5.4">Start from gpt-5.4's picks</button><span class="status" aria-live="polite"></span></div>
            <p class="note">Your answers from round 1 are kept. Run cells turn green when they match your answer and red when they don't.</p>
            <div class="checkgrid">{selects}</div>
            <label class="full"><span>What was right or wrong, and why</span><textarea rows="3" data-field="note" placeholder="e.g. It is a school book: the exercises start on page 5. Page 1 to 3 are the cover and credits."></textarea></label>
            <div class="reply" hidden></div>
          </div>"""
        cards.append(f"""
      <article class="book">
        <div class="cover">{img}</div>
        <div class="bookbody">
          <h3>{esc(b['file'][:-4])}</h3>
          <p class="meta">{b['pages']} pages · {b['sizeMB']} MB · {TEXT_LAYER.get(first['measured']['textLayer'], '')} · scan {b['scanMs'] / 1000:.1f} s</p>
          <p class="meta">gpt-5.4-mini {badge('gpt-5.4-mini')} &nbsp; gpt-5.4 {badge('gpt-5.4')}</p>
          <div class="tablewrap"><table class="runs"><thead><tr><th></th>{head}</tr></thead><tbody>{''.join(body)}</tbody></table></div>
          {check}
          <details><summary>What the AI said about this book (gpt-5.4-mini, run 1)</summary><ul class="plain">{''.join(reasons)}</ul></details>
        </div>
      </article>""")
        summary.append(
            f"<tr><td>{esc(b['file'][:-4][:60])}</td><td class='r'>{b['pages']}</td>"
            f"<td class='r'>{stable['gpt-5.4-mini']}/{n_settings}</td><td class='r'>{stable['gpt-5.4']}/{n_settings}</td>"
            f"<td class='r'>{sum(1 for _, _, r in ok if any(f['ask'] for f in r['facts']))}/{len(ok)}</td><td class='r'>{models_agree}/{n_settings}</td><td class='r'>{'<span class="pill w">' + str(silent[0]) + '</span>' if silent[0] else '<span class="pill">0</span>'}</td>"
            f"<td class='r'>{sum(r['timings']['totalMs'] for _, _, r in ok) / len(ok) / 1000:.1f} s</td></tr>")

    now, before = score(ROUND), score(ROUND - 1) if ROUND > 1 else None
    pct = lambda c: f"{100 * c['ok'] / max(1, c['n']):.0f}%"
    cmp_rows = "".join(
        f"<tr><td>{m}</td>"
        + (f"<td class='r'>{before[m]['ok']}/{before[m]['n']} · {pct(before[m])}</td><td class='r'>{before[m]['silent']}</td>" if before else "")
        + f"<td class='r'><b>{now[m]['ok']}/{now[m]['n']} · {pct(now[m])}</b></td><td class='r'>{now[m]['asked']}</td>"
        + f"<td class='r'>{'<span class=\"pill w\">' + str(now[m]['silent']) + '</span>' if now[m]['silent'] else '<span class=\"pill\">0</span>'}</td></tr>"
        for m in MODELS)
    cmp_head = ("<th class='r'>Right, round " + str(ROUND - 1) + "</th><th class='r'>Wrong and not asked, round " + str(ROUND - 1) + "</th>" if before else "")
    findings_file = os.path.join(ROOT, "reports", f"findings-round{ROUND}.html")
    findings = open(findings_file).read() if os.path.exists(findings_file) else ""
    all_now = sum(now[m]["n"] for m in MODELS)
    ok_now = sum(now[m]["ok"] for m in MODELS)
    silent_now = sum(now[m]["silent"] for m in MODELS)
    section = f"""
  <section id="your-books">
    <span class="eyebrow">Your books · round {ROUND}</span>
    <h2>Auto mode on your 14 books, scored against your answers</h2>
    <p class="find">Each book ran 3 times with gpt-5.4-mini and 3 times with gpt-5.4, every run a fresh AI call with no cache. Every run is scored against the answers you gave in round 1: green cells match your answer, red ones don't. An orange cell differs from that model's other runs on the book, and a star (*) marks one that came without a question to the user.</p>
    <div class="tiles">
      <div class="tile"><span class="k">Settings right, both models</span><span class="v">{100 * ok_now / max(1, all_now):.0f}% <small>{ok_now} of {all_now}</small></span><span class="n">checked against your answers</span></div>
      <div class="tile"><span class="k">Wrong and not asked</span><span class="v">{silent_now} <small>of {all_now}</small></span><span class="n">a wrong setting nobody would have been asked about</span></div>
      <div class="tile"><span class="k">Settings that changed between runs</span><span class="v">{changed['odd']} <small>of {changed['cells']}</small></span><span class="n">{changed['odd'] - changed['odd_silent']} of them came with a question to the user</span></div>
    </div>
    <div class="panel">
      <h3>Round {ROUND - 1} → round {ROUND}</h3>
      <div class="tablewrap"><table>
        <thead><tr><th>Model</th>{cmp_head}<th class="r">Right, round {ROUND}</th><th class="r">Wrong, but asked</th><th class="r">Wrong and not asked</th></tr></thead>
        <tbody>{cmp_rows}</tbody></table></div>
      <p class="note">Counts every run (3 per model per book) and every setting you gave an answer for. On triste either Dynamic or Two Columns Story counts as right, as your note says.</p>
    </div>
    {findings}
    <div class="panel" id="review">
      <div class="checkhead"><h3>Your review, round {ROUND}</h3><span class="status" id="reviewStatus" aria-live="polite">Connecting…</span></div>
      <p class="note">Your round 1 answers are filled in below; change any that were wrong. Everything saves as you type, and I read it back, so tell me "read my feedback" to start the next round.</p>
      <div class="tablewrap"><table id="score"></table></div>
      <label class="full"><span>Anything else about auto mode</span><textarea rows="3" data-general placeholder="What should auto mode do differently? What would you check first as a user?"></textarea></label>
      <div class="reply" id="generalReply" hidden></div>
    </div>
    <div class="panel"><div class="tablewrap"><table>
      <thead><tr><th>Book</th><th class="r">Pages</th><th class="r">Same picks, mini</th><th class="r">Same picks, gpt-5.4</th><th class="r">Runs that ask</th><th class="r">Models agree</th><th class="r">Changed without asking</th><th class="r">Avg time</th></tr></thead>
      <tbody>{''.join(summary)}</tbody></table></div>
      <p class="note">"Same picks" counts the 6 settings that came out identical in all 3 runs of that model. Time includes the scan, which reads every page.</p>
    </div>
    <div class="books">{''.join(cards)}
    </div>
    <script type="application/json" id="reviewMeta">{json.dumps({"books": books_meta, "settings": [k for k, *_ in SETTING], "round": ROUND}).replace("<", "\\u003c")}</script>
    <style>{open(os.path.join(ROOT, "reports", "review.css")).read()}</style>
    <script>{open(os.path.join(ROOT, "reports", "review.js")).read()}</script>
  </section>
"""
    open(os.path.join(ROOT, "reports", "e3-books-section.html"), "w").write(section)
    print(f"{len(cards)} book cards")


main()
