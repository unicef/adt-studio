"""
Builds reports/e3-costs.html (private: it embeds book covers) from the template, the data JSON and the
"Your books" section made by report-books.py.
    python3 report-books.py && python3 build-report.py
"""
import json, os

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")
t = open(os.path.join(R, "e3-costs.template.html")).read()
d = json.load(open(os.path.join(R, "e3-costs-data.json")))
section = open(os.path.join(R, "e3-books-section.html")).read()
assert "<!--BOOKS-->" in t and "/*DATA*/" in t
out = t.replace("<!--BOOKS-->", section, 1).replace("/*DATA*/", json.dumps(d, separators=(",", ":")).replace("<", "\\u003c"), 1)
open(os.path.join(R, "e3-costs.html"), "w").write(out)
print("wrote reports/e3-costs.html", len(out) // 1024, "KB")
