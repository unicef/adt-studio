import { describe, expect, it } from "vitest"
import { inspectImportedActivity } from "../adt-round-trip/activity.js"

describe("inspectImportedActivity controls and heading", () => {
  it("names the controls a page holds and its first heading", () => {
    const html = `<main><div id="content"><section data-section-id="pg001_sec001" data-section-type="content">
      <h2>Caro estudante</h2><p>Escreva sua resposta:</p><input type="text" aria-label="Resposta">
      <label><input type="checkbox"> Li o texto</label><label><input type="checkbox"> Fiz o resumo</label>
      <button type="button">Verificar</button><input type="hidden" value="x">
    </section></div></main>`
    const inspection = inspectImportedActivity(html, "pg001_sec001")
    expect(inspection.heading).toBe("Caro estudante")
    expect(inspection.controls).toEqual(expect.arrayContaining([
      { kind: "text-field", count: 1 },
      { kind: "checkbox", count: 2 },
      { kind: "button", count: 1 },
    ]))
    expect(inspection.controls).toHaveLength(3)
  })

  it("reports no heading and no controls on a plain page", () => {
    const inspection = inspectImportedActivity(
      `<section data-section-id="pg001_sec001" data-section-type="content"><p>Text only</p></section>`,
      "pg001_sec001",
    )
    expect(inspection.heading).toBeNull()
    expect(inspection.controls).toEqual([])
  })
})
