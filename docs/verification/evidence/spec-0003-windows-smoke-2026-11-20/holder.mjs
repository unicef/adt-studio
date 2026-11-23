import fs from "node:fs"
import { pathToFileURL } from "node:url"

const [storageDist, bookDir, releaseFile] = process.argv.slice(2)
const { withBookWriter } = await import(pathToFileURL(storageDist).href)

await withBookWriter(bookDir, () => new Promise(resolve => {
  process.stdout.write(JSON.stringify({ held: true, pid: process.pid }) + "\n")
  const timer = setInterval(() => {
    if (fs.existsSync(releaseFile)) { clearInterval(timer); resolve() }
  }, 50)
}))
process.stdout.write(JSON.stringify({ released: true }) + "\n")
