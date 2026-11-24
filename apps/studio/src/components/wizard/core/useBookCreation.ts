import { createContext, createElement, useContext, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useCreateBook } from "@/hooks/use-books"
import { buildConfigOverrides } from "./bookCreationConfig"
import type { WizardFormValues } from "./wizardForm"

export { classifyCreateError, type CreateFailureKind } from "./createErrors"

/** What creating a book takes; `useBookCreation` returns the real one unless a provider replaces it. */
export interface BookCreation {
  createBook: (values: WizardFormValues, setupRecommendationId?: string) => Promise<{ label: string }>
  willExtract: (values: WizardFormValues) => boolean
  startExtract: (label: string) => Promise<void>
  openBook: (label: string, values: WizardFormValues) => void
}

const BookCreationContext = createContext<BookCreation | null>(null)

/** Replaces creating books (the Add Book lab simulates it, so trying the flow never makes a real book). */
export function BookCreationProvider({ value, children }: { value: BookCreation; children: ReactNode }) {
  return createElement(BookCreationContext.Provider, { value }, children)
}

/**
 * Creating a book from the wizard form, shared by the AI setup and the step-by-step wizard: create it
 * (settings + PDF in one request), start extraction, then open it. Split into those three so a
 * screen can show each one as it happens.
 */
export function useBookCreation(): BookCreation {
  const override = useContext(BookCreationContext)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createMutation = useCreateBook()
  const { apiKey, hasStructuredTextProvider, anthropicKey, googleKey, customBaseUrl, customApiKey, azureKey, azureRegion, geminiKey } = useApiKey()

  /** `setupRecommendationId` links the book to the recommendation it was set up from (kept in the book folder). */
  const createBook = (values: WizardFormValues, setupRecommendationId?: string) =>
    createMutation.mutateAsync({
      label: values.label.trim(),
      pdf: values.file!,
      config: buildConfigOverrides(values),
      setupRecommendationId,
    })

  // Kick off extraction automatically so the user lands on the book home
  // with the Extract stage already running — but only when the user intends
  // to process the book here ("whole" or windowed "range"). For the "split"
  // scope we skip it: each contributor extracts their own page-range part,
  // so extracting the full book on this machine would be the very cost the
  // split feature avoids.
  const willExtract = (values: WizardFormValues) => values.scope !== "split" && hasStructuredTextProvider

  async function startExtract(label: string) {
    // Seed the run status the book page reads, so it paints "Extract
    // queued" on first render. Without this the page mounts with a cold
    // cache and shows an idle pipeline until its own step-status fetch
    // round-trips — several seconds while the server is busy opening the
    // PDF, which reads as "the run never started".
    queryClient.setQueryData(["books", label, "step-status"], {
      stages: { extract: "queued" },
      steps: {},
      error: null,
    })
    try {
      await api.runStages(
        label,
        apiKey,
        { fromStage: "extract", toStage: "extract" },
        {
          anthropicApiKey: anthropicKey || undefined,
          googleApiKey: googleKey || undefined,
          customBaseUrl: customBaseUrl || undefined,
          customApiKey: customApiKey || undefined,
          azure: { key: azureKey, region: azureRegion },
          geminiApiKey: geminiKey || undefined,
        },
      )
    } catch (pipelineError) {
      // Roll the seeded status back — nothing is running.
      queryClient.removeQueries({ queryKey: ["books", label, "step-status"] })
      throw pipelineError
    }
  }

  function openBook(label: string, values: WizardFormValues) {
    // When splitting, surface the Split & merge panel on the overview.
    if (values.scope === "split" && typeof window !== "undefined") {
      window.sessionStorage.setItem("adt:focus-parts", label)
    }
    navigate({ to: "/books/$label/$step", params: { label, step: "book" } })
  }

  return override ?? { createBook, willExtract, startExtract, openBook }
}
