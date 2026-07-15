import { useMemo, useState } from "react"
import {
  AlertTriangle,
  BookOpen,
  Building2,
  ChevronRight,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  User,
  X,
} from "lucide-react"
import { useForm, useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import type { BookMetadata } from "@adt/types"
import type { PageSummaryItem } from "@/api/client"
import { useBook, useUpdateBookMetadata, useRegenerateBookSummary } from "@/hooks/use-books"
import { usePageImage } from "@/hooks/use-pages"
import { useApiKey } from "@/hooks/use-api-key"
import { LanguagePicker } from "@/components/LanguagePicker"
import { getBaseLanguage, getDisplayName, normalizeLocale } from "@/lib/languages"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"

/** Editable book-metadata draft — only the user-editable subset. */
interface MetadataDraft {
  title: string
  authors: string[]
  publisher: string
  language_code: string
}

const EMPTY_DRAFT: MetadataDraft = {
  title: "",
  authors: [],
  publisher: "",
  language_code: "",
}

function toDraft(metadata: BookMetadata): MetadataDraft {
  return {
    title: metadata.title ?? "",
    authors: metadata.authors ?? [],
    publisher: metadata.publisher ?? "",
    language_code: metadata.language_code ?? "",
  }
}

/**
 * Book header for the Extract stage. Reads as a banner (cover + title +
 * metadata + summary) and flips in place into an editable form (TanStack Form)
 * via the Edit button, so users discover that title/authors/publisher/language
 * are correctable right where they read them. Cover, page count, and extraction
 * rationale stay read-only. Changing the language warns before saving because
 * it resets the language-dependent downstream stages.
 */
export function BookHeader({
  bookLabel,
  pages,
  metadataRunning,
}: {
  bookLabel: string
  pages: PageSummaryItem[] | undefined
  metadataRunning?: boolean
}) {
  const { t } = useLingui()
  const { data: book } = useBook(bookLabel)
  const { apiKey } = useApiKey()
  const updateMetadata = useUpdateBookMetadata()
  const regenerateSummary = useRegenerateBookSummary()

  const [editing, setEditing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const metadata = book?.metadata ?? null
  const original = useMemo(
    () => (metadata ? toDraft(metadata) : null),
    [metadata],
  )
  const affectedStages = useDownstreamWithOutput("storyboard")

  const coverPageNumber = metadata?.cover_page_number ?? 1
  const coverPage = pages?.find((p) => p.pageNumber === coverPageNumber)
  const { data: coverImage } = usePageImage(bookLabel, coverPage?.pageId ?? "")

  const form = useForm({
    defaultValues: original ?? EMPTY_DRAFT,
    onSubmit: ({ value }) => {
      if (!metadata || !original) return
      const trimmedAuthors = value.authors.map((a) => a.trim()).filter(Boolean)
      const payload: BookMetadata = {
        ...metadata,
        title: value.title.trim() || null,
        authors: trimmedAuthors.filter((a, i) => trimmedAuthors.indexOf(a) === i),
        publisher: value.publisher.trim() || null,
        language_code: value.language_code
          ? normalizeLocale(value.language_code)
          : null,
      }
      // A base-language change (es -> fr) makes the book summary stale; regenerate
      // just that step in the new language instead of re-running the whole stage.
      const baseChanged =
        getBaseLanguage(payload.language_code ?? "") !==
        getBaseLanguage(original.language_code)
      updateMetadata.mutate(
        { label: bookLabel, metadata: payload },
        {
          onSuccess: () => {
            setEditing(false)
            if (baseChanged && apiKey) {
              regenerateSummary.mutate({ label: bookLabel, apiKey })
            }
          },
        },
      )
    },
  })

  const values = useStore(form.store, (s) => s.values)
  // Use isDefaultValue (value-based) rather than isDirty: TanStack's isDirty is a
  // sticky "has been touched" flag that stays true after a field is reverted to
  // its original value, which would keep Save enabled for a no-op metadata write.
  const isModified = useStore(form.store, (s) => !s.isDefaultValue)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)

  if (!book) return null

  const displayTitle = book.title ?? metadata?.title ?? bookLabel
  const displayAuthors = metadata?.authors?.filter(Boolean).join(", ")
  const displayPublisher = book.publisher ?? metadata?.publisher
  const displayLanguage = book.languageCode ?? metadata?.language_code
  const summary = book.bookSummary?.summary

  const languageChanged = original
    ? normalizeLocale(values.language_code) !== normalizeLocale(original.language_code)
    : false
  const needsConfirmation = languageChanged && affectedStages.length > 0
  const originalLanguageName = getDisplayName(original?.language_code ?? "")

  const openEditor = () => {
    form.reset(metadata ? toDraft(metadata) : EMPTY_DRAFT)
    setEditing(true)
  }

  // A language change resets language-dependent downstream stages, so route
  // through the confirmation dialog first; otherwise submit straight away.
  const handleSave = () => {
    if (!isModified || !canSubmit || updateMetadata.isPending) return
    if (needsConfirmation) {
      setConfirmOpen(true)
    } else {
      form.handleSubmit()
    }
  }

  const unsavedBadge = (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      <Trans>Unsaved changes</Trans>
    </span>
  )

  const coverThumb = (className: string, iconClassName: string) =>
    coverImage ? (
      <img
        src={`data:image/png;base64,${coverImage.imageBase64}`}
        alt={t`Cover of ${displayTitle}`}
        className={`${className} object-cover`}
      />
    ) : (
      <div
        className={`${className} flex items-center justify-center text-muted-foreground`}
      >
        <BookOpen className={iconClassName} />
      </div>
    )

  return (
    <div
      className={`mx-4 mt-3 overflow-hidden rounded-xl border bg-card transition-all duration-200 ${editing ? "border-primary/30 shadow-md ring-1 ring-primary/15" : "shadow-sm"}`}
    >
      {/* Display mode */}
      {!editing && (
        <div className="flex items-start gap-5 p-4 animate-in fade-in duration-200">
          <div className="w-24 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-border">
            {coverThumb("block h-auto w-full", "h-8 w-8")}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start gap-3">
              <h3 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
                {displayTitle}
              </h3>
              {metadata && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={openEditor}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <Trans>Edit book metadata</Trans>
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {displayAuthors && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  {displayAuthors}
                </span>
              )}
              {displayPublisher && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  {displayPublisher}
                </span>
              )}
              {displayLanguage && (
                <span className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  {displayLanguage}
                </span>
              )}
              {book.pageCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  {book.pageCount} {book.pageCount === 1 ? t`page` : t`pages`}
                </span>
              )}
            </div>
            {summary && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {summary}
              </p>
            )}
            {metadataRunning && !metadata && (
              <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <Trans>Processing metadata…</Trans>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit mode */}
      {editing && metadata && (
        <form
          className="animate-in fade-in duration-200"
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
        >
          {/* Header strip */}
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
            <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-border">
              {coverThumb("h-full w-full", "h-6 w-6")}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold leading-tight">
                <Trans>Edit book details</Trans>
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                <Trans>Correct the metadata extracted from the document.</Trans>
              </p>
            </div>
            {isModified && unsavedBadge}
          </div>

          {/* Body */}
          <div className="space-y-5 p-4">
            {/* Title */}
            <form.Field name="title">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    <Trans>Title</Trans>
                  </Label>
                  <Input
                    autoFocus
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder={t`Book title`}
                    className="font-medium"
                  />
                </div>
              )}
            </form.Field>

            {/* Authors */}
            <form.Field name="authors" mode="array">
              {(arrayField) => {
                const authors = arrayField.state.value
                const lastEmpty =
                  authors.length > 0 && authors[authors.length - 1].trim() === ""
                return (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <Trans>Authors</Trans>
                    </Label>
                    <div className="space-y-2">
                      {authors.length > 0 && (
                        <div className="space-y-2">
                          {authors.map((_, i) => (
                            <form.Field key={i} name={`authors[${i}]`}>
                              {(subField) => (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={subField.state.value}
                                    onChange={(e) => subField.handleChange(e.target.value)}
                                    onBlur={subField.handleBlur}
                                    placeholder={t`Author name`}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t`Remove author`}
                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => arrayField.removeValue(i)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </form.Field>
                          ))}
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                        disabled={lastEmpty}
                        onClick={() => arrayField.pushValue("")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <Trans>Add author</Trans>
                      </Button>
                    </div>
                  </div>
                )
              }}
            </form.Field>

            {/* Publisher */}
            <form.Field name="publisher">
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <Trans>Publisher</Trans>
                  </Label>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder={t`Publisher`}
                  />
                </div>
              )}
            </form.Field>

            {/* Language */}
            <form.Field
              name="language_code"
              validators={{
                onChange: ({ value }) =>
                  value.trim()
                    ? undefined
                    : t`A language is required so downstream stages can localize the book.`,
                onMount: ({ value }) =>
                  value.trim()
                    ? undefined
                    : t`A language is required so downstream stages can localize the book.`,
              }}
            >
              {(field) => {
                const error = field.state.meta.errors[0]
                return (
                  <div className="space-y-1.5">
                    <LanguagePicker
                      selected={field.state.value}
                      onSelect={(v) => field.handleChange(v)}
                      label={t`Original language`}
                      hint={t`Add the region (e.g. Spanish — Uruguay) so downstream stages use the right localization.`}
                      size="default"
                    />
                    {error && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {error}
                      </p>
                    )}
                    {languageChanged && (
                      <button
                        type="button"
                        onClick={() => field.handleChange(original?.language_code ?? "")}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {originalLanguageName ? (
                          <Trans>Revert to {originalLanguageName}</Trans>
                        ) : (
                          <Trans>Revert language change</Trans>
                        )}
                      </button>
                    )}
                    {needsConfirmation && (
                      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="text-xs leading-relaxed text-foreground">
                          <span className="font-semibold">
                            <Trans>Changing the language resets downstream work.</Trans>
                          </span>{" "}
                          <span className="text-muted-foreground">
                            <Trans>
                              Completed language-based stages (quizzes, glossary,
                              captions, audio) will be cleared and need to run again.
                              You'll confirm first.
                            </Trans>
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )
              }}
            </form.Field>

            {/* Extracted info (read-only) */}
            <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                <Trans>Extracted from the document</Trans>
                <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Trans>Read-only</Trans>
                </span>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  <Trans>{book.pageCount} pages</Trans>
                </span>
                {metadata.cover_page_number != null && (
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="h-3 w-3" />
                    <Trans>Cover: page {String(metadata.cover_page_number)}</Trans>
                  </span>
                )}
              </div>

              {summary && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    <Trans>Summary</Trans>
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {summary}
                  </p>
                </div>
              )}

              {metadata.reasoning && (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronRight className="h-3 w-3 transition-transform duration-200 group-open:rotate-90" />
                    <Trans>Extraction notes</Trans>
                  </summary>
                  <p className="mt-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                    {metadata.reasoning}
                  </p>
                </details>
              )}
            </div>

            {updateMetadata.isError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <Trans>Failed to save metadata. Please try again.</Trans>
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t bg-muted/40 px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={updateMetadata.isPending}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              type="submit"
              size="sm"
              className="gap-1.5"
              disabled={!isModified || !canSubmit || updateMetadata.isPending}
            >
              {updateMetadata.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <Trans>Saving…</Trans>
                </>
              ) : (
                <Trans>Save changes</Trans>
              )}
            </Button>
          </div>
        </form>
      )}

      <CascadeResetDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        affectedStages={affectedStages}
        headerStageSlug="extract"
        title={<Trans>Change the book language?</Trans>}
        description={
          <Trans>
            The completed stages below will be reset and need to run again so
            they use the new language. Your page sections are kept.
          </Trans>
        }
        confirmLabel={<Trans>Change language</Trans>}
        confirmColorClass="bg-blue-600 hover:bg-blue-700"
        onConfirm={() => {
          setConfirmOpen(false)
          form.handleSubmit()
        }}
      />
    </div>
  )
}
