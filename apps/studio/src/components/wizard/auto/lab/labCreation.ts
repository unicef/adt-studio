import { toast } from "sonner"
import type { BookCreation } from "@/components/wizard/core/useBookCreation"
import { wait } from "./mockEngine"

const never = new AbortController().signal

/**
 * Creating a book in the lab, simulated: nothing reaches the API. Saving and starting on the first
 * pages each take a moment, so Creating and Done (and the finish ideas) can be seen; `hold` keeps
 * it at "starting on the first pages" for the stepper's Creating. "Open the book" only says so.
 */
export function labCreation(hold: boolean): BookCreation {
  return {
    async createBook(values) {
      await wait(900, never)
      return { label: values.label.trim() || "lab-book" }
    },
    willExtract: (values) => values.scope !== "split",
    async startExtract() {
      await wait(hold ? Infinity : 1100, never)
    },
    openBook(label) {
      toast.info(`Lab: “Open the book” would open ${label}. Nothing was created.`, { position: "top-center" })
    },
  }
}
