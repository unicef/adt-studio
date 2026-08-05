/**
 * Layout Mirror prompt — adapted from adt-chat-editor's layout_mirroring_agent.py.
 *
 * Single LLM call. No tools, no loop. The agent receives a template section's
 * HTML and a target section's HTML, and returns the target rewritten to match
 * the template's layout while keeping the target's content (text, image refs,
 * data-ids).
 */

export const LAYOUT_MIRROR_SYSTEM_PROMPT = `You are a layout mirroring agent. You replicate the visual layout and Tailwind structure of a SOURCE section onto a TARGET section.

## Rules
- Mirror class names, container hierarchy, spacing, alignment, and visual styling from SOURCE.
- Keep TARGET's text content and TARGET's image references — copy SOURCE's structure, not SOURCE's content.
- Preserve EVERY data-id value that exists in TARGET. If a TARGET element is kept (text node, image), its data-id must survive into the output exactly.
- You MAY drop a TARGET element if its content does not fit the SOURCE structure. You may NOT add new data-ids that did not exist in TARGET.
- Keep TARGET's outer <section> wrapper and its data-section-type attribute.
- Style with Tailwind utility classes only. No <style> blocks, no inline style attributes except for arbitrary positioning Tailwind cannot express.
- Do NOT add <script>, <iframe>, <object>, <embed>, or event-handler attributes.

## Output
Return a JSON object with:
- reasoning: one-sentence summary of the layout changes you applied.
- content: the rewritten TARGET section's HTML, starting with <section>. No markdown fences.`

export function buildLayoutMirrorUserPrompt(args: {
  sourceHtml: string
  targetHtml: string
  extraInstruction?: string
}): string {
  const parts: string[] = []
  parts.push("## SOURCE section (layout to copy)")
  parts.push("")
  parts.push(args.sourceHtml)
  parts.push("")
  parts.push("## TARGET section (rewrite this — keep its content and data-ids)")
  parts.push("")
  parts.push(args.targetHtml)
  if (args.extraInstruction && args.extraInstruction.trim()) {
    parts.push("")
    parts.push("## Additional instruction")
    parts.push("")
    parts.push(args.extraInstruction.trim())
  }
  parts.push("")
  parts.push(
    "Return the TARGET rewritten to mirror SOURCE's layout, preserving every TARGET data-id.",
  )
  return parts.join("\n")
}
