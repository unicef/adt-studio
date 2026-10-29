import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sqlite from "node-sqlite3-wasm"
import { asString } from "../lib/parse-call"
import type { BookPage } from "../lib/types"
import { adtAssetsDir, conversionFiles, fileOrNull, resolveConversionDir } from "./conversions"

const { Database } = sqlite
type Db = InstanceType<typeof Database>

interface RenderedSection {
  type: string
  html: string
}

export interface PageLinks {
  css: string
  assets: string | null
  image: (imageId: string) => string
}

const TAILWIND_FROM = path.join(path.dirname(fileURLToPath(import.meta.url)), "_tailwind_input.css")
const CSS_CACHE_SIZE = 8
const cssCache = new Map<string, Promise<string>>()

async function databaseFor(booksDir: string, name: string) {
  const dir = resolveConversionDir(booksDir, name)
  const files = await conversionFiles(dir)
  if (!files) throw new Error(`No conversion database found in ${dir}`)
  return files
}

function withDatabase<T>(dbPath: string, read: (db: Db, tables: Set<string>) => T): T {
  const db = new Database(dbPath, { readOnly: true, fileMustExist: true })
  try {
    const tables = new Set((db.all("select name from sqlite_master where type = 'table'") as { name: string }[]).map((r) => r.name))
    return read(db, tables)
  } finally {
    db.close()
  }
}

function parseSections(raw: string): RenderedSection[] | null {
  try {
    const parsed = JSON.parse(raw) as { sections?: unknown }
    if (!Array.isArray(parsed.sections)) return null
    return parsed.sections.flatMap((section: { sectionType?: unknown; html?: unknown } | null) => {
      const html = asString(section?.html)
      return html === null ? [] : [{ type: asString(section?.sectionType) ?? "section", html }]
    })
  } catch {
    return null
  }
}

function latestRenderings(db: Db, tables: Set<string>, pageId?: string): Map<string, RenderedSection[]> {
  const renderings = new Map<string, RenderedSection[]>()
  if (!tables.has("node_data")) return renderings
  const onePage = pageId === undefined ? "" : "and nd.item_id = ?"
  const sql = tables.has("node_current")
    ? `select nd.item_id as item_id, nd.data as data from node_data nd
       left join node_current nc on nc.node = nd.node and nc.item_id = nd.item_id
       where nd.node = 'web-rendering' ${onePage}
       order by nd.item_id, (nd.version = nc.version) desc, nd.version desc`
    : `select nd.item_id as item_id, nd.data as data from node_data nd
       where nd.node = 'web-rendering' ${onePage}
       order by nd.item_id, nd.version desc`
  const rows = db.all(sql, pageId === undefined ? [] : [pageId]) as { item_id: string; data: string | null }[]
  for (const row of rows) {
    if (renderings.has(row.item_id) || row.data === null) continue
    const sections = parseSections(row.data)
    if (sections) renderings.set(row.item_id, sections)
  }
  return renderings
}

export async function listPages(booksDir: string, name: string): Promise<BookPage[]> {
  const files = await databaseFor(booksDir, name)
  return withDatabase(files.db, (db, tables) => {
    if (!tables.has("pages")) return []
    const renderings = latestRenderings(db, tables)
    const pageImages = new Set(
      tables.has("images") ? (db.all("select image_id from images where image_id like '%\\_page' escape '\\'") as { image_id: string }[]).map((r) => r.image_id) : [],
    )
    const pages = db.all("select page_id, page_number from pages order by page_number") as { page_id: string; page_number: number }[]
    return pages.map((page) => ({
      pageId: page.page_id,
      pageNumber: Number(page.page_number),
      hasImage: pageImages.has(`${page.page_id}_page`),
      sectionTypes: renderings.get(page.page_id)?.map((s) => s.type) ?? null,
    }))
  })
}

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

const STUDIO_IMAGE_URL = /\/api\/books\/[^/"'\s)]+\/images\/([^"'\s)?#]+)/g

export async function renderPage(booksDir: string, name: string, pageId: string, links: PageLinks): Promise<string | null> {
  const files = await databaseFor(booksDir, name)
  const sections = withDatabase(files.db, (db, tables) => latestRenderings(db, tables, pageId).get(pageId))
  if (!sections) return null
  const content = sections
    .map((s) => s.html.replace(STUDIO_IMAGE_URL, (_, id: string) => escapeAttr(links.image(decodeURIComponent(id)))))
    .join('\n<hr style="margin:0;border:0;border-top:2px dashed #b9b8ae">\n')
  const background = content.match(/data-background-color="([^"]*)"/)?.[1]
  const assetLinks = links.assets
    ? `
  <link href="${escapeAttr(`${links.assets}/libs/fontawesome/css/all.min.css`)}" rel="stylesheet">
  <link href="${escapeAttr(`${links.assets}/fonts.css`)}" rel="stylesheet">`
    : ""
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="${escapeAttr(links.css)}" rel="stylesheet">${assetLinks}
</head>
<body class="min-h-screen flex items-center justify-center"${background ? ` style="background-color: ${escapeAttr(background)};"` : ""}>
  <main class="w-full">
${content}
  </main>
</body>
</html>
`
}

async function compileTailwind(html: string): Promise<string> {
  const assets = adtAssetsDir()
  const input = assets ? await fs.readFile(path.join(assets, "tailwind_css.css"), "utf8") : '@import "tailwindcss";'
  const postcss = (await import("postcss")).default
  const tailwindcss = (await import("@tailwindcss/postcss")).default
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "adt-dashboard-css-"))
  const source = path.join(temp, "pages.html")
  await fs.writeFile(source, html)
  try {
    const result = await postcss([tailwindcss({ base: temp })]).process(`@source "${source.replace(/\\/g, "/")}";\n${input}`, { from: TAILWIND_FROM })
    return result.css
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
}

export async function pageCss(booksDir: string, name: string): Promise<string> {
  const files = await databaseFor(booksDir, name)
  const key = `${files.db}:${files.entry.dbModified}`
  const cached = cssCache.get(key)
  if (cached) return cached
  const html = withDatabase(files.db, (db, tables) =>
    [...latestRenderings(db, tables).values()]
      .flat()
      .map((s) => s.html)
      .join("\n"),
  )
  const css = compileTailwind(html)
  cssCache.set(key, css)
  css.catch(() => cssCache.delete(key))
  while (cssCache.size > CSS_CACHE_SIZE) cssCache.delete(cssCache.keys().next().value as string)
  return css
}

const ASSET_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".svg": "image/svg+xml",
}

export async function readAdtAsset(relative: string): Promise<{ bytes: Buffer; type: string } | null> {
  const dir = adtAssetsDir()
  if (!dir) return null
  const file = path.resolve(dir, relative)
  const type = ASSET_TYPES[path.extname(file).toLowerCase()]
  if (!type || !file.startsWith(dir + path.sep) || !(await fileOrNull(file))) return null
  return { bytes: await fs.readFile(file), type }
}
