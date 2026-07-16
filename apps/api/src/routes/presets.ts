import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import yaml from "js-yaml"
import {
  AppConfig,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  DefaultModelConfig,
  SpecializedModelDefaultsConfig,
  StyleguideName,
} from "@adt/types"

function setTopLevelYamlValue(
  content: string,
  key: string,
  value: string,
): string {
  const line = `${key}: ${JSON.stringify(value)}`
  const matcher = new RegExp(`^${key}:\\s*.*$`, "m")
  return matcher.test(content)
    ? content.replace(matcher, line)
    : `${line}\n${content}`
}

export function createPresetRoutes(configPath: string): Hono {
  const app = new Hono()

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

  // POST /styleguides/upload — Upload a styleguide .md file
  app.post("/styleguides/upload", async (c) => {
    const body = await c.req.parseBody()
    const file = body["file"]
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "Missing file" })
    }
    if (!file.name.endsWith(".md")) {
      throw new HTTPException(400, { message: "Only .md files are accepted" })
    }
    const name = file.name.replace(/\.md$/, "")
    const result = StyleguideName.safeParse(name)
    if (!result.success) {
      throw new HTTPException(400, { message: "Invalid styleguide name" })
    }
    const styleguidesDir = path.join(path.dirname(configPath), "assets", "styleguides")
    fs.mkdirSync(styleguidesDir, { recursive: true })
    const content = await file.text()
    fs.writeFileSync(path.join(styleguidesDir, `${result.data}.md`), content, "utf-8")
    return c.json({ name: result.data })
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

  // Return the global fallback text-generation model.
  app.get("/config/default-model", (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = AppConfig.parse(yaml.load(content))
    return c.json({ model: parsed.default_model ?? DEFAULT_LLM_MODEL_ID })
  })

  // Update only the fallback model while preserving config.yaml formatting.
  app.put("/config/default-model", async (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const result = DefaultModelConfig.safeParse(await c.req.json())
    if (!result.success) {
      throw new HTTPException(400, { message: "Invalid default model id" })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = yaml.load(content) as Record<string, unknown>
    AppConfig.parse({ ...parsed, default_model: result.data.model })

    const updated = setTopLevelYamlValue(
      content,
      "default_model",
      result.data.model,
    )
    fs.writeFileSync(configPath, updated, "utf-8")

    return c.json(result.data)
  })

  // Return the global defaults used by image and OpenAI speech generation.
  app.get("/config/specialized-model-defaults", (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = AppConfig.parse(yaml.load(content))
    return c.json({
      imageGeneration:
        parsed.default_image_generation_model ??
        DEFAULT_IMAGE_GENERATION_MODEL_ID,
      speechGeneration:
        parsed.default_speech_generation_model ??
        DEFAULT_OPENAI_TTS_MODEL_ID,
    })
  })

  // Update only specialized defaults while preserving the rest of config.yaml.
  app.put("/config/specialized-model-defaults", async (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const result = SpecializedModelDefaultsConfig.safeParse(await c.req.json())
    if (!result.success) {
      throw new HTTPException(400, {
        message: "Invalid specialized model defaults",
      })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = yaml.load(content) as Record<string, unknown>
    AppConfig.parse({
      ...parsed,
      default_image_generation_model: result.data.imageGeneration,
      default_speech_generation_model: result.data.speechGeneration,
    })

    const withImageModel = setTopLevelYamlValue(
      content,
      "default_image_generation_model",
      result.data.imageGeneration,
    )
    const updated = setTopLevelYamlValue(
      withImageModel,
      "default_speech_generation_model",
      result.data.speechGeneration,
    )
    fs.writeFileSync(configPath, updated, "utf-8")

    return c.json(result.data)
  })

  return app
}
