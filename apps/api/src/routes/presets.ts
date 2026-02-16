import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import yaml from "js-yaml"
import { PresetName } from "@adt/types"

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
