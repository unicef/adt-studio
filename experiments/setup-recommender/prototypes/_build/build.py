"""Builds each prototype's index.html from _build/<direction>.html by inlining shared CSS/JS and real PoC data.

Run from experiments/setup-recommender:  python3 prototypes/_build/build.py
Data comes from results/poc/ (E4 one-call run 1 = reading A, E5 page labels run 1 = reading B) and datasets/poc.json.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, "prototypes")
B = os.path.join(P, "_build")

BOOKS = [
    ("storybook-1930-el-viaje", "1930: El Viaje", "El Viaje"),
    ("storybook-hyena-and-raven", "Hyena and Raven", "Hyena & Raven"),
    ("storybook-colouring-my-school", "Colouring My School", "My School"),
    ("textbook-praticas-de-alfabetizacao-e-de-matematica", "Práticas de Alfabetização e de Matemática", "Práticas"),
]
RUN = 1

dataset = {b["id"]: b for b in json.load(open(os.path.join(ROOT, "datasets/poc.json")))["books"]}
books = []
for bid, title, short in BOOKS:
    a = json.load(open(os.path.join(ROOT, f"results/poc/{bid}.e4-one-call.run{RUN}.json")))
    e5 = json.load(open(os.path.join(ROOT, f"results/poc/{bid}.e5-page-types.run{RUN}.json")))
    e0 = json.load(open(os.path.join(ROOT, f"results/poc/{bid}.e0-poc.run{RUN}.json")))
    dims = json.load(open(os.path.join(P, "pages", bid, "dims.json")))
    books.append({
        "id": bid, "title": title, "short": short,
        "pageCount": len(dims), "dims": dims,
        "measured": a["facts"],
        "readingA": a["trace"]["answers"],
        "readingB": {"semantic": e5["trace"]["semantic"], "pages": e5["trace"]["pageLabels"], "counts": e5["trace"]["counts"]},
        "e0": {k: v["value"] for k, v in e0["settings"].items()},
        "truth": dataset[bid]["facts"],
        "known": dataset[bid].get("labels", {}),
        "description": dataset[bid]["description"],
    })

css = open(os.path.join(B, "base.css")).read()
js = open(os.path.join(B, "base.js")).read()
data = "const DATA = " + json.dumps({"books": books, "source": f"results/poc run {RUN}: E4 one-call (reading A), E5 page labels (reading B), gpt-5.4-mini"}, ensure_ascii=False) + ";"

for d in ["confirm-facts", "teaching-chat", "describe-first"]:
    src = open(os.path.join(B, f"{d}.html")).read()
    out = src.replace("/*BASE_CSS*/", css).replace("/*DATA*/", data).replace("/*BASE_JS*/", js)
    os.makedirs(os.path.join(P, d), exist_ok=True)
    open(os.path.join(P, d, "index.html"), "w").write(out)
    print(d, len(out))

# ---- round 2: check-then-ask (mixed flow). Per-book run: Egypt uses run 2, where the page reading calls the history lessons "story".
BOOKS2 = [
    ("storybook-1930-el-viaje", "1930: El Viaje", "El Viaje", 1),
    ("textbook-egito-antigo", "Egito Antigo", "Egypt", 2),
    ("storybook-colouring-my-school", "Colouring My School", "My School", 1),
    ("textbook-praticas-de-alfabetizacao-e-de-matematica", "Práticas de Alfabetização e de Matemática", "Práticas", 1),
    ("storybook-hyena-and-raven", "Hyena and Raven", "Hyena & Raven", 1),
]
books2 = []
for bid, title, short, run in BOOKS2:
    a = json.load(open(os.path.join(ROOT, f"results/poc/{bid}.e4-one-call.run{run}.json")))
    e5 = json.load(open(os.path.join(ROOT, f"results/poc/{bid}.e5-page-types.run{run}.json")))
    dims = json.load(open(os.path.join(P, "pages", bid, "dims.json")))
    books2.append({
        "id": bid, "title": title, "short": short, "run": run,
        "source": f"run {run}, E4 one call + E5 page labels, gpt-5.4-mini",
        "pageCount": len(dims), "dims": dims, "measured": a["facts"],
        "readingA": a["trace"]["answers"],
        "readingB": {"semantic": e5["trace"]["semantic"], "pages": e5["trace"]["pageLabels"], "counts": e5["trace"]["counts"]},
        "truth": dataset[bid]["facts"],
    })
data2 = "const DATA = " + json.dumps({"books": books2}, ensure_ascii=False) + ";"
src = open(os.path.join(B, "check-then-ask.html")).read()
out = src.replace("/*BASE_CSS*/", css).replace("/*DATA*/", data2).replace("/*BASE_JS*/", js)
os.makedirs(os.path.join(P, "check-then-ask"), exist_ok=True)
open(os.path.join(P, "check-then-ask", "index.html"), "w").write(out)
print("check-then-ask", len(out))

# ---- round 3: three directions side by side, one source (_build/round3.html), one data source (prototypes/data/*.json from export-prototype-data.ts).
# Wording of questions and option descriptions comes from the dev's book files (plainQuestion / plainOptions), so screen and data match.
BOOKS3 = [
    ("storybook-1930-el-viaje", "1930: El Viaje", "El Viaje"),
    ("textbook-egito-antigo", "Egito Antigo", "Egypt"),
    ("storybook-colouring-my-school", "Colouring My School", "My School"),
    ("textbook-praticas-de-alfabetizacao-e-de-matematica", "Práticas de Alfabetização e de Matemática", "Práticas"),
    ("storybook-hyena-and-raven", "Hyena and Raven", "Hyena & Raven"),
    ("reference-reimagining-target-aware-molecular", "Reimagining Target-Aware Molecular Generation", "Research paper"),
]
books3 = []
for bid, title, short in BOOKS3:
    d = json.load(open(os.path.join(P, "data", f"{bid}.json")))
    a = json.load(open(os.path.join(ROOT, f"results/poc/{bid}.e4-one-call.run1.json")))
    dims = json.load(open(os.path.join(P, "pages", bid, "dims.json")))
    books3.append({
        "id": bid, "title": title, "short": short, "pageCount": len(dims), "dims": dims,
        "measured": a["facts"],  # includes vectorDiagrams and spread evidence, which decide() needs
        "facts": d["facts"], "coverage": d["coverage"], "ask": d["ask"], "askAcrossRuns": d.get("askAcrossRuns"),
        "pageLabels": d["pageLabels"],
    })
data3 = "const DATA = " + json.dumps({"books": books3}, ensure_ascii=False) + ";"
src3 = open(os.path.join(B, "round3.html")).read()
for flow, folder, title in [("check", "r3-check-then-ask", "Check Then Ask"), ("tell", "r3-tell-while-reading", "Tell While Reading"), ("teach", "r3-teach-me", "Teach Me Mode")]:
    out = src3.replace("/*BASE_CSS*/", css).replace("/*DATA*/", data3).replace("/*BASE_JS*/", js).replace("/*FLOW*/", flow).replace("/*TITLE*/", title)
    os.makedirs(os.path.join(P, folder), exist_ok=True)
    open(os.path.join(P, folder, "index.html"), "w").write(out)
    print(folder, len(out))

# ---- review-screen variants ("the AI runs, shows its picks, the user confirms or changes; ask only if needed").
# One source (_build/confirm.html). The plain words, sketches and layout pictures are cut out of round3.html,
# so the variants say exactly what round 3 says. Same DATA as round 3.
def between(s, a, b):
    i = s.index(a); j = s.index(b, i)
    return s[i:j]
r3css = src3[src3.index("<style>") + len("<style>"):src3.index("</style>")].replace("/*BASE_CSS*/", css)
r3words = between(src3, "/* ---------- words", "/* ---------- state ---------- */")
r3pics = between(src3, "/* ---------- layout pictures", "/* ---------- option card ---------- */")
srcc = open(os.path.join(B, "confirm.html")).read()
for flow, folder, title in [("picks", "v-picks-list", "Picks List"), ("result", "v-result-first", "Result First"), ("sure", "v-sure-unsure", "Sure Or Not"), ("settings", "v-settings", "Settings View"), ("sentence", "v-sentence", "One Sentence")]:
    out = (srcc.replace("/*R3_CSS*/", r3css).replace("/*DATA*/", data3).replace("/*BASE_JS*/", js)
           .replace("/*R3_WORDS*/", r3words).replace("/*R3_PICTURES*/", r3pics).replace("/*FLOW*/", flow).replace("/*TITLE*/", title))
    os.makedirs(os.path.join(P, folder), exist_ok=True)
    open(os.path.join(P, folder, "index.html"), "w").write(out)
    print(folder, len(out))
