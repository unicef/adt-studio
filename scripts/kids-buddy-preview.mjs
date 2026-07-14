import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const buddiesDir = path.join(
  rootDir,
  "apps/adt-runtime/src/features/kids/assets/buddies",
)
const outputPath = path.join(rootDir, ".context/kids-mode/buddy-preview.html")

const sources = [
  { id: "dino", file: "dino.ts", exportName: "DINO_BUDDY" },
  { id: "robot", file: "robot.ts", exportName: "ROBOT_BUDDY" },
  { id: "bunny", file: "bunny.ts", exportName: "BUNNY_BUDDY" },
  { id: "cat", file: "cat.ts", exportName: "CAT_BUDDY" },
  { id: "alien", file: "alien.ts", exportName: "ALIEN_BUDDY" },
]

const freeColors = {
  primary: "#FF6F91",
  secondary: "#FFF2B8",
  accent: "#2FD3C7",
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function extractString(source, key) {
  const keyMatch = source.match(new RegExp(`${key}:\\s*(['"])`))
  if (!keyMatch || keyMatch.index === undefined) {
    throw new Error(`Could not extract ${key}`)
  }

  const quote = keyMatch[1]
  const valueStart = keyMatch.index + keyMatch[0].length
  let escaped = false

  for (let index = valueStart; index < source.length; index += 1) {
    const char = source[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (char === quote) {
      return source.slice(valueStart, index)
    }
  }

  throw new Error(`Could not find closing quote for ${key}`)
}

function extractPalettes(source) {
  const palettesBlock = source.match(/palettes:\s*\[([\s\S]*?)\n\s*\],/)
  if (!palettesBlock) throw new Error("Could not extract palettes")

  return [...palettesBlock[1].matchAll(/\{([\s\S]*?)\}/g)].map((match) => {
    const objectSource = match[1]
    return {
      id: extractString(objectSource, "id"),
      labelFallback: extractString(objectSource, "labelFallback"),
      primary: extractString(objectSource, "primary"),
      secondary: extractString(objectSource, "secondary"),
      accent: extractString(objectSource, "accent"),
    }
  })
}

function paletteStyle(palette) {
  return [
    `--buddy-primary:${palette.primary}`,
    `--buddy-secondary:${palette.secondary}`,
    `--buddy-accent:${palette.accent}`,
  ].join(";")
}

function swatch(color) {
  return `<span class="swatch" style="background:${color}"></span>`
}

function renderSmallCell(svg, palette) {
  return `<div class="cell"><div class="art small" style="${paletteStyle(
    palette,
  )}">${svg}</div><div class="meta"><strong>${escapeHtml(
    palette.labelFallback,
  )}</strong><span>${swatch(palette.primary)}${swatch(
    palette.secondary,
  )}${swatch(palette.accent)}</span></div></div>`
}

function renderHero(art) {
  const classic = art.palettes[0]
  return `<section class="hero"><div class="art large" style="${paletteStyle(
    classic,
  )}">${art.svg}</div><div><h2>${escapeHtml(
    art.id,
  )}</h2><p>240px hero, classic palette defaults.</p></div></section>`
}

function renderPaletteRows(art) {
  const rows = art.palettes
    .map((palette) => renderSmallCell(art.svg, palette))
    .join("\n")
  const freeRow = renderSmallCell(art.svg, {
    id: "free-color",
    labelFallback: "Free color",
    ...freeColors,
  })

  return `<section><h2>${escapeHtml(art.id)} palettes</h2><div class="grid">${rows}\n${freeRow}</div></section>`
}

function renderMotion(arts) {
  return `<section><h2>Motion check</h2><div class="motion-grid">${arts
    .map((art) => {
      const classic = art.palettes[0]
      return `<div class="motion-card"><div class="art motion" style="${paletteStyle(
        classic,
      )}">${art.svg}</div><strong>${escapeHtml(art.id)}</strong></div>`
    })
    .join("\n")}</div></section>`
}

function htmlDocument(arts) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kids Buddy Preview</title>
  <style>
    :root {
      color: #233042;
      background: #f7fbff;
      font-family: ui-rounded, "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif;
    }
    body {
      margin: 0;
      padding: 32px;
    }
    h1, h2, p {
      margin: 0;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 8px;
    }
    h2 {
      font-size: 18px;
      margin: 28px 0 14px;
      text-transform: capitalize;
    }
    p {
      color: #5c6a7c;
    }
    .hero {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-top: 24px;
      padding: 18px 0;
      border-top: 1px solid #d9e6f2;
    }
    .grid, .motion-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }
    .cell, .motion-card {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 118px;
      padding: 12px;
      border: 1px solid #d9e6f2;
      border-radius: 8px;
      background: #ffffff;
    }
    .motion-card {
      justify-content: center;
      flex-direction: column;
      min-height: 168px;
    }
    .art {
      display: inline-block;
      line-height: 0;
    }
    .art svg {
      display: block;
      overflow: visible;
    }
    .small svg {
      width: 96px;
      height: 96px;
    }
    .large svg {
      width: 240px;
      height: 240px;
    }
    .motion svg {
      width: 96px;
      height: 96px;
      animation: buddy-bob 3s ease-in-out infinite;
      transform-origin: 60px 60px;
    }
    .motion [data-part="eyes"] {
      animation: buddy-blink 3s ease-in-out infinite;
      transform-box: fill-box;
      transform-origin: center;
    }
    .motion [data-part="mouth"] {
      animation: buddy-talk 650ms ease-in-out infinite;
      transform-box: fill-box;
      transform-origin: center;
    }
    .meta {
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .meta span {
      display: flex;
      gap: 6px;
    }
    .swatch {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 1px solid rgb(35 48 66 / 18%);
    }
    @keyframes buddy-bob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    @keyframes buddy-blink {
      0%, 88%, 100% { transform: scaleY(1); }
      92%, 94% { transform: scaleY(.12); }
    }
    @keyframes buddy-talk {
      0%, 100% { transform: translateY(0) scaleY(1); }
      50% { transform: translateY(1px) scaleY(.7); }
    }
  </style>
</head>
<body>
  <h1>Kids Buddy Preview</h1>
  <p>Layered SVG pilot art: dino and robot. Presets plus one free-color proof row.</p>
  ${arts.map(renderHero).join("\n")}
  ${arts.map(renderPaletteRows).join("\n")}
  ${renderMotion(arts)}
</body>
</html>
`
}

const arts = await Promise.all(
  sources.map(async (source) => {
    const fileSource = await readFile(path.join(buddiesDir, source.file), "utf8")
    if (!fileSource.includes(`export const ${source.exportName}`)) {
      throw new Error(`Missing ${source.exportName} in ${source.file}`)
    }

    return {
      id: source.id,
      svg: extractString(fileSource, "svg"),
      palettes: extractPalettes(fileSource),
    }
  }),
)

for (const art of arts) {
  if (art.svg.length < 500) {
    throw new Error(
      `Extracted SVG for ${art.id} is unexpectedly short (${art.svg.length} characters)`,
    )
  }
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, htmlDocument(arts), "utf8")

console.log(`Wrote ${path.relative(rootDir, outputPath)}`)
