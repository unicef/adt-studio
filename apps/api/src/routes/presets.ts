import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import yaml from "js-yaml"
import { PresetName, StyleguideName } from "@adt/types"

export function createPresetRoutes(configPath: string): Hono {
  const app = new Hono()
  const presetsDir = path.join(path.dirname(configPath), "config", "presets")

  // GET /presets/:name — Return preset config overrides
  app.get("/presets/:name", (c) => {
    const result = PresetName.safeParse(c.req.param("name"))

    if (!result.success) {
      throw new HTTPException(404, { message: `Unknown preset: ${c.req.param("name")}` })
    }

    const name = result.data
    const presetPath = path.join(presetsDir, `${name}.yaml`)
    if (!fs.existsSync(presetPath)) {
      throw new HTTPException(404, { message: `Preset not found: ${name}` })
    }

    const content = fs.readFileSync(presetPath, "utf-8")
    const parsed = yaml.load(content) as Record<string, unknown>
    return c.json({ config: parsed })
  })

  // GET /styleguides — List available styleguide names
  app.get("/styleguides", (c) => {
    const styleguidesDir = path.join(path.dirname(configPath), "assets", "styleguides")
    if (!fs.existsSync(styleguidesDir)) {
      return c.json({ styleguides: [] })
    }
    const files = fs.readdirSync(styleguidesDir)
    const names = files
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
    return c.json({ styleguides: names })
  })

  // GET /styleguides/:name/preview — Return preview HTML for a styleguide
  app.get("/styleguides/:name/preview", (c) => {
    const result = StyleguideName.safeParse(c.req.param("name"))
    if (!result.success) {
      throw new HTTPException(400, { message: "Invalid styleguide name" })
    }
    const name = result.data
    const styleguidesDir = path.join(path.dirname(configPath), "assets", "styleguides")
    const previewPath = path.join(styleguidesDir, `${name}-preview.html`)
    if (fs.existsSync(previewPath)) {
      const html = fs.readFileSync(previewPath, "utf-8")
      return c.json({ name, html })
    }
    // Fallback: render the markdown content as a styled HTML page
    const mdPath = path.join(styleguidesDir, `${name}.md`)
    if (!fs.existsSync(mdPath)) {
      throw new HTTPException(404, { message: `Styleguide not found: ${name}` })
    }
    const md = fs.readFileSync(mdPath, "utf-8")
    const escapedMd = md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    // Convert basic markdown to HTML for readability
    // Extract code blocks into placeholders so paragraph replacement doesn't corrupt them
    const codeBlocks: string[] = []
    const withPlaceholders = escapedMd
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
        const idx = codeBlocks.length
        codeBlocks.push(`<pre style="background:#f3f4f6;border-radius:0.5rem;padding:1rem;overflow-x:auto;font-size:0.8rem;line-height:1.5;margin:0.75rem 0;"><code>${code}</code></pre>`)
        return `\x00CODEBLOCK${idx}\x00`
      })
    const bodyHtml = withPlaceholders
      .replace(/^### (.+)$/gm, '<h3 style="font-size:1.1rem;font-weight:700;margin:1.5rem 0 0.5rem;">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:1.3rem;font-weight:700;margin:2rem 0 0.75rem;border-bottom:1px solid #e5e7eb;padding-bottom:0.5rem;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size:1.6rem;font-weight:800;margin:0 0 1rem;">$1</h1>')
      .replace(/\n\n/g, '</p><p style="margin:0.5rem 0;line-height:1.6;">')
      .replace(/\x00CODEBLOCK(\d+)\x00/g, (_match, idx) => codeBlocks[Number(idx)])
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Styleguide — ${name}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:56rem;margin:0 auto;padding:2rem;color:#1f2937;font-size:0.95rem;}
table{border-collapse:collapse;width:100%;margin:0.75rem 0;}th,td{border:1px solid #e5e7eb;padding:0.4rem 0.75rem;text-align:left;font-size:0.85rem;}th{background:#f9fafb;font-weight:600;}</style>
</head><body><p style="margin:0.5rem 0;line-height:1.6;">${bodyHtml}</p></body></html>`
    return c.json({ name, html })
  })

  // GET /config — Return the global base config
  app.get("/config", (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = yaml.load(content) as Record<string, unknown>
    return c.json({ config: parsed })
  })

  return app
}
