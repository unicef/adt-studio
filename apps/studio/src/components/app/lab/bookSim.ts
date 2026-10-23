import { createPersistentStore } from "@/hooks/create-persistent-store"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockState } from "@/components/app/screens/pipeline/shared/usePipelineState"

export type BookSim = "real" | "storyboard" | "some" | "all" | "warning" | "error"

const SIMS: readonly BookSim[] = ["real", "storyboard", "some", "all", "warning", "error"]

const store = createPersistentStore<BookSim>(
  "adt.lab.book-sim",
  "real",
  (value): value is BookSim => typeof value === "string" && SIMS.includes(value as BookSim),
)

export const useBookSim = store.use
export const setBookSim = store.set

const SOME: readonly DockSlug[] = ["captions", "toc", "quizzes"]
const WARNING: readonly DockSlug[] = ["captions", "toc", "quizzes", "glossary", "translate"]

export function simState(sim: BookSim, slug: DockSlug): DockState | null {
  if (sim === "real") return null
  if (sim === "storyboard") return "ready"
  if (sim === "all") return "done"
  if (sim === "error" && slug === "quizzes") return "error"
  const included = sim === "warning" ? WARNING : SOME
  return included.includes(slug) ? "done" : "ready"
}

export function simPending(sim: BookSim, slug: DockSlug): number | null {
  if (sim === "real") return null
  return sim === "warning" && slug === "captions" ? 4 : 0
}

export function simOutOfDate(sim: BookSim): boolean {
  return sim === "warning"
}

export function useBookSimFor(label: string): BookSim {
  const [sim] = store.use()
  return label.startsWith("lab-") ? sim : "real"
}
