import { inputSignature } from "./output-freshness.js"

/** Allocate once from validated generation; subsequent source text patches
 * preserve this identity and every answer/control reference to it. */
export function generatedActivityId(sectionId: string, id: string, html: string): string {
  return `${sectionId}_activity_${inputSignature({ id, html }).slice(0, 24)}`
}

/** Recognizing an ID is not evidence of generated origin. Callers must verify
 * the rendering's provenance separately before permitting any text patch. */
export function isGeneratedActivityId(id: string, sectionId: string): boolean {
  const prefix = `${sectionId}_activity_`
  return id.startsWith(prefix) && /^[a-f0-9]{24}$/.test(id.slice(prefix.length))
}
