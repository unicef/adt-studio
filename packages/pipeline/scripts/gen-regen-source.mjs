#!/usr/bin/env node
/**
 * Embeds the standalone regenerator script (regenerate-tts.mjs) into a TS
 * string constant so it travels with the bundled pipeline code in every
 * environment (dev, docker, electron) with no asset-copy plumbing.
 *
 * The `.mjs` file is the source of truth. Run this after editing it:
 *   node packages/pipeline/scripts/gen-regen-source.mjs
 *
 * A unit test (regen-source drift) fails if the committed generated file falls
 * out of sync with the `.mjs`.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const scriptPath = path.join(here, "..", "src", "regen", "regenerate-tts.mjs")
const outPath = path.join(here, "..", "src", "regen", "regen-source.generated.ts")

const source = fs.readFileSync(scriptPath, "utf-8")

const banner = "// AUTO-GENERATED from regenerate-tts.mjs by scripts/gen-regen-source.mjs. Do not edit by hand.\n"
const contents =
  banner +
  "/* eslint-disable */\n" +
  "export const REGEN_SCRIPT_SOURCE: string = " +
  JSON.stringify(source) +
  "\n"

fs.writeFileSync(outPath, contents)
console.log(`Wrote ${path.relative(path.join(here, ".."), outPath)} (${source.length} bytes embedded).`)
