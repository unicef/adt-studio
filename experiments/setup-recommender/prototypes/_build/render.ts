// Renders every page of the prototype books into prototypes/pages/<book>/p<N>.jpg (long side 500 px).
// Same scaling as profile.ts renderPages, but JPEG so picture-book pages stay under ~150 KB.
// Pass book ids after the dirs to render only those.
// Run from experiments/setup-recommender: ../../node_modules/.bin/tsx prototypes/_build/render.ts <pdf-dir> prototypes/pages
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import mupdf from "../../../../packages/pdf/node_modules/mupdf/dist/mupdf.js"

const [pdfDir, outDir, ...only] = process.argv.slice(2)
const allBooks = [
  "storybook-1930-el-viaje",
  "storybook-colouring-my-school",
  "textbook-praticas-de-alfabetizacao-e-de-matematica",
  "storybook-hyena-and-raven",
  "textbook-egito-antigo",
]
const books = only.length ? only : allBooks
const size = 500
for (const b of books) {
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync(join(pdfDir, b + ".pdf"))), "application/pdf")
  const n = doc.countPages()
  mkdirSync(join(outDir, b), { recursive: true })
  const dims: Record<number, [number, number]> = {}
  for (let p = 1; p <= n; p++) {
    const page = doc.loadPage(p - 1)
    const bb = page.getBounds()
    const scale = size / Math.max(bb[2] - bb[0], bb[3] - bb[1])
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
    dims[p] = [pix.getWidth(), pix.getHeight()]
    writeFileSync(join(outDir, b, `p${p}.jpg`), pix.asJPEG(78))
  }
  writeFileSync(join(outDir, b, "dims.json"), JSON.stringify(dims))
  console.log(b, n)
}
