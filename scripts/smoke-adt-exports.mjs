#!/usr/bin/env node

import fs from "node:fs"
import http from "node:http"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"

const requireFromPipeline = createRequire(new URL("../packages/pipeline/package.json", import.meta.url))
const { chromium } = requireFromPipeline("playwright")

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "(nothing)"}`)
    }
    args[key.slice(2)] = value
  }
  return args
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".xml": "application/xml; charset=utf-8",
}

async function createServer(root) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")
    const file = path.resolve(root, relative)
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("Not found")
      return
    }
    response.setHeader("content-type", contentTypes[path.extname(file)] ?? "application/octet-stream")
    fs.createReadStream(file).pipe(response)
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  return server
}

async function checkExport(browser, label, exportDirectory, screenshotsDirectory) {
  const server = await createServer(exportDirectory)
  try {
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Could not resolve smoke server port")
    const htmlFiles = fs.readdirSync(exportDirectory).filter((file) => file.endsWith(".html")).sort()
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    page.on("console", (message) => {
      if (message.type() === "error") errors.push({ type: "console", message: message.text() })
    })
    page.on("pageerror", (error) => errors.push({ type: "page", message: error.message }))
    page.on("requestfailed", (request) => errors.push({
      type: "request",
      message: `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`,
    }))
    const pages = []
    if (screenshotsDirectory) fs.mkdirSync(screenshotsDirectory, { recursive: true })
    for (const file of htmlFiles) {
      const response = await page.goto(`http://127.0.0.1:${address.port}/${encodeURIComponent(file)}`, {
        waitUntil: "load",
        timeout: 30_000,
      })
      pages.push({
        file,
        status: response?.status() ?? null,
        title: await page.title(),
        bodyTextLength: (await page.locator("body").innerText()).trim().length,
      })
      if (screenshotsDirectory) {
        await page.screenshot({
          path: path.join(screenshotsDirectory, `${path.basename(file, ".html")}.png`),
          fullPage: true,
        })
      }
    }
    await context.close()
    return {
      label,
      htmlFiles: htmlFiles.length,
      successfulPages: pages.filter((item) => item.status === 200 && item.bodyTextLength > 0).length,
      errors,
      pages,
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const labels = (args.labels ?? "").split(",").filter(Boolean)
  if (labels.length === 0) throw new Error("--labels requires one or more comma-separated book labels")
  const booksRoot = path.resolve(args["books-root"] ?? path.join(
    os.homedir(), "Library", "Application Support", "@adt", "desktop", "books",
  ))
  const screenshotsRoot = args["screenshots-dir"] ? path.resolve(args["screenshots-dir"]) : null
  const browser = await chromium.launch({ headless: true })
  try {
    const results = []
    for (const label of labels) {
      const exportDirectory = path.join(booksRoot, label, "adt")
      if (!fs.existsSync(exportDirectory)) throw new Error(`Export not found: ${exportDirectory}`)
      results.push(await checkExport(
        browser,
        label,
        exportDirectory,
        screenshotsRoot ? path.join(screenshotsRoot, label) : null,
      ))
    }
    const output = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      results,
      passed: results.every((result) => result.successfulPages === result.htmlFiles && result.errors.length === 0),
    }
    const serialized = `${JSON.stringify(output, null, 2)}\n`
    if (args.out) {
      const outputPath = path.resolve(args.out)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, serialized, "utf8")
    }
    process.stdout.write(serialized)
    if (!output.passed) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
