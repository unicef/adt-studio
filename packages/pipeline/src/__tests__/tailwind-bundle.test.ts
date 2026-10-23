import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { build } from "esbuild"
import { expect, it } from "vitest"

const runNode = promisify(execFile)

it("builds export and preview CSS when dependencies live beside a relocated server bundle", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-tailwind-bundle-"))
  try {
    const runtime = path.join(root, "runtime")
    const assets = path.join(root, "assets")
    const book = path.join(root, "book")
    fs.mkdirSync(runtime)
    fs.mkdirSync(assets)
    fs.mkdirSync(path.join(book, "content"), { recursive: true })
    fs.writeFileSync(path.join(book, "index.html"), '<div class="p-7">Export</div>')
    fs.writeFileSync(path.join(assets, "tailwind_css.css"), '@import "tailwindcss";\n@import "tw-animate-css";')
    fs.symlinkSync(
      fileURLToPath(new URL("../../node_modules", import.meta.url)),
      path.join(runtime, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    )
    const bundle = path.join(runtime, "server.mjs")
    await build({
      entryPoints: [fileURLToPath(new URL("../tailwind.ts", import.meta.url))],
      outfile: bundle,
      bundle: true,
      format: "esm",
      platform: "node",
      external: ["postcss", "@tailwindcss/postcss"],
    })
    const preview = path.join(root, "preview.css")
    await runNode(process.execPath, ["--input-type=module", "-e", `
      import fs from "node:fs";
      const { buildTailwindCss, buildPreviewTailwindCss } = await import(${JSON.stringify(pathToFileURL(bundle).href)});
      await buildTailwindCss(${JSON.stringify(book)}, ${JSON.stringify(assets)});
      fs.writeFileSync(${JSON.stringify(preview)}, await buildPreviewTailwindCss('<div class="p-5">Preview</div>', ${JSON.stringify(assets)}));
    `], { cwd: runtime, timeout: 15_000 })
    expect(fs.readFileSync(path.join(book, "content", "tailwind_output.css"), "utf8")).toContain(".p-7")
    expect(fs.readFileSync(preview, "utf8")).toContain(".p-5")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}, 20_000)
