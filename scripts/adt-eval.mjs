#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { createBlindCaptionPack, evaluateSuite, readSuite, resolveBlindCaptionReview } from "./lib/adt-eval-core.mjs"

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Expected --name value; received ${key ?? "(nothing)"}`)
    args[key.slice(2)] = value
  }
  return args
}

function writeJson(file, value) {
  const target = path.resolve(file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function main() {
  const [command = "evaluate", ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)
  if (command === "resolve-review") {
    if (!args.pack || !args.key || !args.reviewer || !args.out) throw new Error("resolve-review requires --pack, --key, --reviewer, and --out")
    const result = resolveBlindCaptionReview(
      JSON.parse(fs.readFileSync(path.resolve(args.pack), "utf8")),
      JSON.parse(fs.readFileSync(path.resolve(args.key), "utf8")),
      args.reviewer,
    )
    writeJson(args.out, result)
    process.stdout.write(`${JSON.stringify({ reviews: result.reviews.length, out: path.resolve(args.out) }, null, 2)}\n`)
    return
  }
  if (!args.suite) throw new Error("--suite is required")
  const { suite, baseDirectory } = readSuite(args.suite)
  if (command === "validate") {
    process.stdout.write(`${JSON.stringify({ valid: true, suiteId: suite.id, candidates: suite.candidates.length }, null, 2)}\n`)
    return
  }
  if (command === "blind-pack") {
    if (!args.out || !args["key-out"]) throw new Error("blind-pack requires --out and --key-out")
    const result = createBlindCaptionPack(suite, baseDirectory)
    writeJson(args.out, result.pack)
    writeJson(args["key-out"], result.key)
    process.stdout.write(`${JSON.stringify({ samples: result.pack.samples.length, out: path.resolve(args.out), keyOut: path.resolve(args["key-out"]) }, null, 2)}\n`)
    return
  }
  if (command !== "evaluate") throw new Error(`Unknown command: ${command}`)
  const report = evaluateSuite(suite, baseDirectory)
  if (args.out) writeJson(args.out, report)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (Object.values(report.rankings).some((ranking) => ranking.every((entry) => !entry.eligible))) process.exitCode = 2
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
