import { normalizeLocale } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { GlossaryOutput, QuizGenerationOutput, TocGenerationOutput } from "@adt/types"

import { readAdtBundle } from "../adt-bundle-reader.js"
import { pageIdFromSection } from "../adt-import-catalog.js"
import { recoverImportedQuizzes } from "../adt-import-quiz.js"

export function seedImportedFeatures(
  label: string,
  booksDir: string,
  bundle: ReturnType<typeof readAdtBundle>,
  generatedAt: string,
): void {
  const storage = createBookStorage(label, booksDir)
  try {
    if (bundle.toc.length > 0) {
      storage.putNodeData("toc-generation", "book", TocGenerationOutput.parse({
        entries: bundle.toc.map((entry, index) => ({
          id: `toc_${String(index + 1).padStart(3, "0")}`,
          title: entry.title,
          sectionId: entry.section_id,
          href: entry.href,
          chapterId: entry.chapter_id,
          level: entry.level ?? 1,
        })),
        pageCount: bundle.pages.filter((page, index) => (
          pageIdFromSection(page.section_id, index) !== null
        )).length,
        generatedAt,
      }))
      storage.markStepCompleted("toc-generation", "Recovered from exported ADT data")
    }

    const sourceGlossary = bundle.glossaries[bundle.manifest.languages.source]
      ?? bundle.glossaries[normalizeLocale(bundle.manifest.languages.source)]
    if (sourceGlossary && Object.keys(sourceGlossary).length > 0) {
      storage.putNodeData("glossary", "book", GlossaryOutput.parse({
        items: Object.values(sourceGlossary).map((entry) => ({
          id: entry.id,
          source: "manual" as const,
          word: entry.word,
          definition: entry.definition,
          variations: entry.variations,
          emojis: entry.emoji ? [entry.emoji] : [],
        })),
        pageCount: bundle.pages.filter((page, index) => (
          pageIdFromSection(page.section_id, index) !== null
        )).length,
        generatedAt,
      }))
      storage.markStepCompleted("glossary", "Recovered from exported ADT data")
    }

    const sourceTexts = bundle.texts[bundle.manifest.languages.source] ?? {}
    const { quizzes, declaredCount } = recoverImportedQuizzes(bundle, sourceTexts)
    // Seed only what is missing. A re-projection (see
    // `ensureImportedAdtProjectProjection`) must not replace quizzes the user
    // has edited in Studio since the import.
    if (quizzes.length > 0 && !storage.getLatestNodeData("quiz-generation", "book")) {
      storage.putNodeData("quiz-generation", "book", QuizGenerationOutput.parse({
        generatedAt,
        language: normalizeLocale(bundle.manifest.languages.source),
        pagesPerQuiz: Math.max(...quizzes.map((quiz) => quiz.pageIds.length)),
        quizzes,
      }))
      // Only claim the step is done when every quiz in the archive came back.
      // A partial recovery still needs the user to regenerate the rest.
      if (quizzes.length === declaredCount) {
        storage.markStepCompleted("quiz-generation", "Recovered from exported ADT data")
      }
    }
  } finally {
    storage.close()
  }
}

