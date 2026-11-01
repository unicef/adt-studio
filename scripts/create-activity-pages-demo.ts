/** Synthetic books for the experiment. No PDF, provider, or LLM call is needed.
 * Run: pnpm exec tsx scripts/create-activity-pages-demo.ts [books-directory]
 */
import fs from "node:fs"
import path from "node:path"
import { createBookStorage } from "../packages/storage/src/index.js"

const booksDir = path.resolve(process.argv[2] ?? ".context/activity-pages-books")
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64")
for (const mode of ["page", "section"] as const) {
  const label = `activity-pages-${mode}-demo`
  const dir = path.join(booksDir, label)
  if (fs.existsSync(dir)) throw new Error(`Demo already exists: ${dir}. Choose a new books directory to preserve its history.`)
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putNodeData("metadata", "book", { title: `Activity pages — check ${mode}`, language_code: "en", reasoning: "Synthetic experiment fixture" })
    for (const number of [1, 2]) {
      const pageId = `${label}_p${number}`
      storage.putExtractedPage({ pageId, pageNumber: number, text: "Synthetic activity composition fixture",
        pageImage: { imageId: `${pageId}_page`, buffer: png, format: "png", hash: `fixture-${number}`, width: 1, height: 1 }, images: [] })
      const blocks = number === 1 ? [
        { type: "text_only", title: "Explore the sky", body: "Answer the four activities below. Try a wrong answer, check again, and then continue.", html: "", answers: undefined },
        { type: "activity_multiple_choice", title: "1. Choose a star", body: "Which one is a star?", html: '<fieldset class="flex gap-4"><legend class="sr-only">Which one is a star?</legend><label class="activity-option border rounded-xl p-4"><input type="radio" name="choice" data-activity-item="item-1"> Sun</label><label class="activity-option border rounded-xl p-4"><input type="radio" name="choice" data-activity-item="item-2"> Moon</label></fieldset>', answers: { "item-1": true, "item-2": false } },
        { type: "activity_fill_in_the_blank", title: "2. Daytime", body: "What gives Earth daylight? Type sun.", html: '<label>Answer <input id="answer" type="text" class="border rounded p-2" data-aria-id="answer" data-activity-item="item-1"></label>', answers: { "item-1": "sun" } },
        { type: "activity_fill_in_the_blank", title: "3. Nighttime", body: "What orbits Earth? Type moon.", html: '<label>Answer <input id="answer" type="text" class="border rounded p-2" data-aria-id="answer" data-activity-item="item-1"></label>', answers: { "item-1": "moon" } },
        { type: "activity_open_ended_answer", title: "4. Describe the sky", body: "Write a sentence about something you have seen in the sky. This checks completion, not factual correctness.", html: '<label>Your response <textarea class="block border rounded p-2 w-full" data-aria-id="response" rows="2"></textarea></label>', answers: undefined },
      ] : [{ type: "text_only", title: "You reached the next page", body: "All required activities on the previous page were checked. Use Back to revisit your responses.", html: "", answers: undefined }]
      const sections = blocks.map((block, index) => {
        const sectionId = `${pageId}_sec${String(index + 1).padStart(3, "0")}`
        return { sectionId, sectionType: block.type, backgroundColor: "#ffffff", textColor: "#1e293b", pageNumber: number, isPruned: false,
          nodes: [{ nodeId: `${sectionId}_heading`, role: "heading", headingLevel: 2, text: block.title, isPruned: false }, { nodeId: `${sectionId}_text`, role: "text", text: block.body, isPruned: false }] }
      })
      storage.putNodeData("page-sectioning", pageId, { reasoning: "Manually authored experiment fixture", sections })
      storage.putNodeData("web-rendering", pageId, { sections: sections.map((section, index) => ({
        sectionId: section.sectionId, sectionIndex: index, sectionType: section.sectionType, reasoning: "Hand-authored; no LLM",
        html: `<section data-section-id="${section.sectionId}" data-section-type="${section.sectionType}" data-area-id="${section.sectionId}" class="max-w-3xl w-full mx-auto bg-white rounded-2xl border p-6 space-y-4"><h2 data-id="${section.nodes[0].nodeId}" class="text-2xl font-bold">${blocks[index].title}</h2><p data-id="${section.nodes[1].nodeId}">${blocks[index].body}</p>${blocks[index].html}</section>`,
        activityAnswers: blocks[index].answers,
      })) })
    }
    for (const step of ["extract", "page-sectioning", "web-rendering"]) storage.markStepCompleted(step, "Synthetic experiment fixture")
    fs.writeFileSync(path.join(dir, "config.yaml"), `generate_activities: true\npage_sectioning:\n  mode: page\n  experimental_activity_pages: ${mode}\n`)
    console.log(`Created ${label} in ${booksDir}`)
  } finally { storage.close() }
}
