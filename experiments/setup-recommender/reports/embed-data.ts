/**
 * Refreshes the JSON data block inside reports/research.html from results/<dataset>/summary.json
 * and simulation.json (run score.ts and simulate.ts first).
 *   tsx reports/embed-data.ts results/poc reports/research.html
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const [dir, html] = process.argv.slice(2)
const summary = JSON.parse(readFileSync(path.join(dir, "summary.json"), "utf8"))
const sim = JSON.parse(readFileSync(path.join(dir, "simulation.json"), "utf8"))
const data = {
  dataset: summary.dataset,
  generatedAt: summary.generatedAt,
  variants: summary.variants.map((v: Record<string, unknown>) => ({
    ...v,
    books: (v.books as { id: string; diagnostic: boolean; decisions: Record<string, { values: string[]; label: string | null }> }[]).map((b) => ({
      id: b.id, diagnostic: b.diagnostic, decisions: b.decisions,
    })),
  })),
  simulation: {
    factVariants: sim.factVariants.map(({ perBook, ...rest }: Record<string, unknown>) => ({ ...rest, perBook })),
    teach: sim.teach,
    ceiling: sim.ceiling,
  },
}
const src = readFileSync(html, "utf8")
const re = /(<script type="application\/json" id="data">)[\s\S]*?(<\/script>)/
if (!re.test(src)) throw new Error("no data block in " + html)
writeFileSync(html, src.replace(re, (_m, a, b) => `${a}${JSON.stringify(data).replace(/</g, "\\u003c")}${b}`))
console.log(`embedded ${data.variants.length} variants into ${html}`)
