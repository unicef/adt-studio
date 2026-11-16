import { useEffect, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { PUBLISH_STEPS } from "@adt/types"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useBooks } from "@/hooks/use-books"
import type { BookPublishRunController, PublishChecklistState } from "@/hooks/use-book-publication"
import { PublishRunShell } from "./run/PublishRunShell"
import { PublishStepArt } from "./run/art/PublishStepArt"
import { PUBLISH_STEP_COPY } from "./run/publish-steps"

export function PublishAnimationDemo() {
  const { i18n, t } = useLingui()
  const [activeStep, setActiveStep] = useState(0)
  const [selectedBook, setSelectedBook] = useState("")
  const books = useBooks()

  useEffect(() => {
    if (selectedBook || !books.data?.[0]) return
    setSelectedBook(books.data[0].label)
  }, [books.data, selectedBook])

  const selectedBookTitle = books.data?.find((book) => book.label === selectedBook)?.title ?? selectedBook

  const run = useMemo<BookPublishRunController>(() => {
    const stepStates: PublishChecklistState[] = PUBLISH_STEPS.map((_, index) => {
      if (index < activeStep) return "done"
      if (index === activeStep) return "running"
      return "pending"
    })

    return {
      status: "running",
      kind: "update",
      stepStates,
      activeStep: activeStep + 1,
      progress: activeStep === 2 ? { done: 42, total: 147, unit: "files" } : null,
      failure: null,
      result: null,
      startedAt: null,
      publish: () => {},
      update: () => {},
      retry: () => {},
      reset: () => {},
    }
  }, [activeStep])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight"><Trans>Publishing animation gallery</Trans></h1>
            <p className="mt-1 text-sm text-muted-foreground"><Trans>Preview each real publishing loader without changing this book.</Trans></p>
          </div>
          <Button variant="outline" asChild>
            <a href={`/books/${encodeURIComponent(selectedBook)}/publish`}><Trans>Return to publishing</Trans></a>
          </Button>
        </header>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex w-full max-w-sm flex-col gap-1.5 text-sm font-medium sm:w-80">
            <span><Trans>Book artwork</Trans></span>
            <Select value={selectedBook} onValueChange={setSelectedBook}>
              <SelectTrigger aria-label={t`Book artwork`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(books.data ?? []).map((book) => (
                  <SelectItem key={book.label} value={book.label}>
                    {book.title ?? book.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {books.isPending ? <span className="pb-2 text-xs text-muted-foreground"><Trans>Loading books…</Trans></span> : null}
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t`Publishing animation steps`}>
          {PUBLISH_STEP_COPY.map((step, index) => (
            <Button
              key={step.id}
              type="button"
              variant={index === activeStep ? "default" : "outline"}
              size="sm"
              role="tab"
              aria-selected={index === activeStep}
              onClick={() => setActiveStep(index)}
            >
              {i18n._(step.title)}
            </Button>
          ))}
        </div>

        <div className="flex h-[680px] min-h-[520px]">
          <PublishRunShell
            title={selectedBookTitle}
            fromVersion={1}
            run={run}
            elapsedMs={47_000}
            onCancel={() => {}}
            showStepDetail
            artifact={() => <PublishStepArt run={run} bookLabel={selectedBook} shareUrl={null} />}
          />
        </div>
      </div>
    </div>
  )
}
