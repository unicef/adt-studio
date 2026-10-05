import { useCallback, useMemo, useState, type ReactNode } from "react"
import { useForm, useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Plus, RotateCcw, X } from "lucide-react"
import type { BookMetadata } from "@adt/types"
import type { BookDetail } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguagePicker } from "@/components/LanguagePicker"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { useRegisterDirtyTabs } from "@/hooks/use-settings-dirty-tabs"
import { useApiKey } from "@/hooks/use-api-key"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { useRegenerateBookSummary, useUpdateBookMetadata } from "@/hooks/use-books"
import { getBaseLanguage, getDisplayName, normalizeLocale } from "@/lib/languages"
import {
  SettingRow,
  SettingsCard,
  SettingsHeading,
  SettingsLead,
} from "@/components/app/screens/settings/ui"
import { BOOK_INFO_ANCHORS } from "./searchIndex"

interface MetadataDraft {
  title: string
  authors: string[]
  publisher: string
  language_code: string
}

const EMPTY_DRAFT: MetadataDraft = { title: "", authors: [], publisher: "", language_code: "" }

function toDraft(metadata: BookMetadata): MetadataDraft {
  return {
    title: metadata.title ?? "",
    authors: metadata.authors ?? [],
    publisher: metadata.publisher ?? "",
    language_code: metadata.language_code ?? "",
  }
}

function formatDate(iso: string, locale: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ""
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(time)
}

export function BookInfoSection({ label, book }: { label: string; book: BookDetail }) {
  const { t, i18n } = useLingui()
  const { apiKey } = useApiKey()
  const updateMetadata = useUpdateBookMetadata()
  const regenerateSummary = useRegenerateBookSummary()
  const affectedStages = useDownstreamWithOutput("storyboard")
  const [confirmOpen, setConfirmOpen] = useState(false)

  const metadata = book.metadata ?? null
  const original = useMemo(() => (metadata ? toDraft(metadata) : null), [metadata])

  const persist = useCallback(
    async (draft: MetadataDraft) => {
      if (!metadata || !original) return
      const authors = draft.authors.map((author) => author.trim()).filter(Boolean)
      const payload: BookMetadata = {
        ...metadata,
        title: draft.title.trim() || null,
        authors: authors.filter((author, index) => authors.indexOf(author) === index),
        publisher: draft.publisher.trim() || null,
        language_code: draft.language_code ? normalizeLocale(draft.language_code) : null,
      }
      const baseChanged =
        getBaseLanguage(payload.language_code ?? "") !== getBaseLanguage(original.language_code)
      await updateMetadata.mutateAsync({ label, metadata: payload })
      if (baseChanged && apiKey) {
        regenerateSummary.mutate({ label, apiKey })
      }
    },
    [metadata, original, label, apiKey, updateMetadata, regenerateSummary],
  )

  const form = useForm({
    defaultValues: original ?? EMPTY_DRAFT,
    onSubmit: ({ value }) => persist(value),
  })

  const values = useStore(form.store, (state) => state.values)
  const isModified = useStore(form.store, (state) => !state.isDefaultValue)
  const canSubmit = useStore(form.store, (state) => state.canSubmit)

  const languageChanged = original
    ? normalizeLocale(values.language_code) !== normalizeLocale(original.language_code)
    : false
  const needsConfirmation = languageChanged && affectedStages.length > 0
  const originalLanguageName = getDisplayName(original?.language_code ?? "")

  useRegisterDirtyTabs(
    "settings:book:information",
    "book",
    isModified ? ["information"] : [],
    true,
  )

  useFloatingSave({
    id: "settings:book:information",
    dirty: isModified,
    saving: updateMetadata.isPending,
    label: <span className="text-[11px] font-medium text-foreground">{t`Book information`}</span>,
    onSave: () => {
      if (!canSubmit) return
      if (needsConfirmation) {
        setConfirmOpen(true)
        return
      }
      void form.handleSubmit()
    },
    onSaveStay: async () => {
      if (!canSubmit) throw new Error(t`Pick an original language first`)
      await persist(form.store.state.values)
    },
    onDiscard: () => form.reset(original ?? EMPTY_DRAFT),
    saveDisabledReason: canSubmit ? undefined : t`Pick an original language first`,
  })

  if (!metadata) {
    return (
      <>
        <SettingsHeading>
          <Trans>Book information</Trans>
        </SettingsHeading>
        <SettingsLead>
          <Trans>The details extracted from the source document.</Trans>
        </SettingsLead>
        <SettingsCard className="px-[22px] py-5">
          <p className="text-[13px] text-muted-foreground">
            <Trans>
              This book has no metadata yet. Run the Extraction stage to read the title, authors,
              and language from the document.
            </Trans>
          </p>
        </SettingsCard>
      </>
    )
  }

  return (
    <>
      <SettingsHeading>
        <Trans>Book information</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Correct the details extracted from the source document.</Trans>
      </SettingsLead>

      <SettingsCard>
        <form.Field name="title">
          {(field) => (
            <SettingRow
              anchorId={BOOK_INFO_ANCHORS.title}
              title={<Trans>Title</Trans>}
              subtitle={<Trans>Shown across the library and in the exported book.</Trans>}
            >
              <Input
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder={t`Book title`}
                className="w-[300px] font-medium"
              />
            </SettingRow>
          )}
        </form.Field>

        <form.Field name="authors" mode="array">
          {(arrayField) => {
            const authors = arrayField.state.value
            const lastEmpty = authors.length > 0 && authors[authors.length - 1].trim() === ""
            return (
              <SettingRow
                alignStart
                anchorId={BOOK_INFO_ANCHORS.authors}
                title={<Trans>Authors</Trans>}
                subtitle={<Trans>One entry per author, in the order they are credited.</Trans>}
              >
                <div className="flex w-[300px] flex-col gap-2">
                  {authors.map((_, index) => (
                    <form.Field key={index} name={`authors[${index}]`}>
                      {(subField) => (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={subField.state.value}
                            onChange={(event) => subField.handleChange(event.target.value)}
                            onBlur={subField.handleBlur}
                            placeholder={t`Author name`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t`Remove author`}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => arrayField.removeValue(index)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      )}
                    </form.Field>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit gap-1.5 text-muted-foreground hover:text-foreground"
                    disabled={lastEmpty}
                    onClick={() => arrayField.pushValue("")}
                  >
                    <Plus className="size-3.5" />
                    <Trans>Add author</Trans>
                  </Button>
                </div>
              </SettingRow>
            )
          }}
        </form.Field>

        <form.Field name="publisher">
          {(field) => (
            <SettingRow
              anchorId={BOOK_INFO_ANCHORS.publisher}
              title={<Trans>Publisher</Trans>}
              subtitle={<Trans>Appears on the generated cover and in the package metadata.</Trans>}
            >
              <Input
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder={t`Publisher`}
                className="w-[300px]"
              />
            </SettingRow>
          )}
        </form.Field>

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
              <SettingRow
                alignStart
                anchorId={BOOK_INFO_ANCHORS.language}
                title={<Trans>Original language</Trans>}
                subtitle={
                  <Trans>
                    Drives every language-dependent stage — captions, quizzes, glossary, audio.
                  </Trans>
                }
              >
                <div className="flex w-[300px] flex-col gap-2">
                  <LanguagePicker
                    selected={field.state.value}
                    onSelect={(code) => field.handleChange(code)}
                    label={t`Language`}
                    size="default"
                  />
                  {error ? (
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-destructive">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {error}
                    </p>
                  ) : null}
                  {languageChanged && (
                    <button
                      type="button"
                      onClick={() => field.handleChange(original?.language_code ?? "")}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <RotateCcw className="size-3" />
                      {originalLanguageName ? (
                        <Trans>Revert to {originalLanguageName}</Trans>
                      ) : (
                        <Trans>Revert language change</Trans>
                      )}
                    </button>
                  )}
                  {needsConfirmation && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-[12px] leading-relaxed text-foreground">
                        <span className="font-semibold">
                          <Trans>Changing the language resets downstream work.</Trans>
                        </span>{" "}
                        <span className="text-muted-foreground">
                          <Trans>
                            Completed language-based stages will be cleared and need to run again.
                            You will confirm before saving.
                          </Trans>
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </SettingRow>
            )
          }}
        </form.Field>
      </SettingsCard>

      {updateMetadata.isError && (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <Trans>Failed to save the book information. Please try again.</Trans>
        </p>
      )}

      <h2 className="mb-[18px] mt-9 text-[15px] font-semibold tracking-[-0.01em]">
        <Trans>Extracted from the document</Trans>
      </h2>
      <SettingsCard>
        <ReadOnlyRow label={<Trans>Identifier</Trans>} value={book.label} />
        <ReadOnlyRow
          label={<Trans>Pages</Trans>}
          value={book.pageCount > 0 ? String(book.pageCount) : ""}
        />
        <ReadOnlyRow
          label={<Trans>Cover page</Trans>}
          value={metadata.cover_page_number != null ? String(metadata.cover_page_number) : ""}
        />
        <ReadOnlyRow
          label={<Trans>Created</Trans>}
          value={formatDate(book.createdAt, i18n.locale)}
        />
        <ReadOnlyRow
          label={<Trans>Last modified</Trans>}
          value={formatDate(book.modifiedAt, i18n.locale)}
        />
        {book.bookSummary?.summary ? (
          <ReadOnlyRow label={<Trans>Summary</Trans>} value={book.bookSummary.summary} />
        ) : null}
        {metadata.reasoning ? (
          <ReadOnlyRow label={<Trans>Extraction notes</Trans>} value={metadata.reasoning} />
        ) : null}
      </SettingsCard>

      <CascadeResetDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        affectedStages={affectedStages}
        headerStageSlug="extract"
        title={<Trans>Change the book language?</Trans>}
        description={
          <Trans>
            The completed stages below will be reset and need to run again so they use the new
            language. Your page sections are kept.
          </Trans>
        }
        confirmLabel={<Trans>Change language</Trans>}
        confirmColorClass="bg-blue-600 hover:bg-blue-700"
        onConfirm={() => {
          setConfirmOpen(false)
          void form.handleSubmit()
        }}
      />
    </>
  )
}

function ReadOnlyRow({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex gap-5 border-t py-[14px] first:border-t-0">
      <div className="w-40 shrink-0 text-[13px] text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 break-words text-[13px] font-medium">
        {value || <span className="text-muted-foreground/60">—</span>}
      </div>
    </div>
  )
}
