import { useState } from "react"
import { BookOpen, Loader2, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type PresetConfig, type ExampleBook } from "@/components/wizard/constants"
import { usePdfPreviewPages } from "@/components/wizard/shared/usePdfPreviewPages"
import { ExampleSettings } from "./ExampleSettings"

type EmbedTab = "pdf" | "adt"

function PdfCanvasPreview({
  src,
  title,
}: {
  src?: string
  title: string
}) {
  const { t } = useLingui()
  const { pages, isLoading, error } = usePdfPreviewPages({
    src,
    mode: "all",
  })

  if (!src) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[#737373]">
        <Trans>No preview available.</Trans>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-auto bg-[#f5f5f5]" aria-label={title}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f5f5f5]">
          <div className="flex items-center gap-2 text-sm text-[#737373]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <Trans>Loading preview...</Trans>
          </div>
        </div>
      )}

      {error ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#737373]">
          <Trans>Unable to render PDF preview.</Trans>
        </div>
      ) : (
        <div className="mx-auto flex min-h-full w-full max-w-[1100px] flex-col items-center gap-4 p-4">
          {pages.map((pageDataUrl, index) => (
            <img
              key={`${index + 1}-${pageDataUrl.slice(0, 24)}`}
              src={pageDataUrl}
              alt={t`${title} - page ${index + 1}`}
              className="w-full bg-white shadow-sm"
              loading="lazy"
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BookItem({
  book,
  selected,
  onSelect,
}: {
  book: ExampleBook
  selected: boolean
  onSelect: () => void
}) {
  const { i18n } = useLingui()

  if (book.comingSoon) {
    return (
      <div className="w-full rounded-md border border-[#e5e5e5] px-3 py-2.5 opacity-50 cursor-not-allowed">
        <span className="text-sm text-[#737373] leading-snug">
          {book.title}{" "}
          <span className="text-xs italic">
            (<Trans>coming soon</Trans>)
          </span>
        </span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-md border px-3 py-2.5 text-left text-sm leading-snug transition-colors",
        selected
          ? "border-[#2b7fff] bg-white text-[#2b7fff] font-medium"
          : "border-[#e5e5e5] text-[#0a0a0a] hover:border-[#2b7fff]/50",
      ].join(" ")}
    >
      <span className="block">{book.title}</span>

      {selected && book.caption && (
        <span className="mt-1 block font-normal text-[11px] text-[#737373]">
          {i18n._(book.caption)}
        </span>
      )}
    </button>
  )
}

interface ExamplesModalProps {
  open: boolean
  onClose: () => void
  preset: PresetConfig
}

export function ExamplesModal({ open, onClose, preset }: ExamplesModalProps) {
  const { i18n, t } = useLingui()

  const availableBooks = preset.exampleBooks.filter((b) => !b.comingSoon)
  const [selectedBook, setSelectedBook] = useState<ExampleBook | null>(
    () => availableBooks[0] ?? null,
  )
  const [activeTab, setActiveTab] = useState<EmbedTab>("pdf")

  if (!selectedBook) {
    return null
  }

  const pdfUrl = selectedBook.pdfUrl
  const embedUrl = activeTab === "pdf" ? pdfUrl : selectedBook.adtUrl

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2
            w-[95vw] max-w-5xl h-[88vh] flex flex-col md:flex-row rounded-lg bg-white shadow-lg
            overflow-hidden border border-[#e5e5e5]
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="shrink-0 flex flex-col w-full md:w-[240px] max-h-[38%] md:max-h-none overflow-y-auto border-b md:border-b-0 md:border-r border-[#e5e5e5]">
            <div className="px-5 pt-5 pb-4">
              <DialogTitle className="text-base font-bold text-[#0a0a0a] leading-snug mb-1.5">
                {i18n._(preset.title)}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#737373] leading-[18px]">
                {i18n._(preset.description)}
              </DialogDescription>
            </div>

            <div className="px-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737373] mb-2">
                <Trans>Recommended for</Trans>
              </p>
              <ul className="flex flex-col gap-2">
                {preset.recommendedFor.map((item) => (
                  <li key={i18n._(item)} className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 text-[#2b7fff] shrink-0 mt-0.5" />
                    <span className="text-xs text-[#0a0a0a] leading-[18px]">
                      {i18n._(item)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mx-5 border-t border-[#e5e5e5]" />

            <div className="px-5 py-4 flex flex-col gap-3 flex-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737373] mb-1">
                  <Trans>Example Books</Trans>
                </p>
                <p className="text-xs text-[#737373] leading-[18px]">
                  <Trans>
                    Real books processed with this preset — before and after.
                  </Trans>
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {preset.exampleBooks.map((book) => (
                  <BookItem
                    // same book can have examples with different settings
                    key={`${book.title}-${book.settings?.renderStrategy ?? ""}-${book.settings?.pageGrouping ?? ""}`}
                    book={book}
                    selected={selectedBook === book}
                    onSelect={() => {
                      setSelectedBook(book)
                      setActiveTab("pdf")
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as EmbedTab)}
              className="flex flex-1 flex-col min-h-0"
            >
              <div className="flex shrink-0 items-center border-b border-[#e5e5e5]">
                <TabsList className="h-auto flex-1 justify-start rounded-none bg-transparent p-0">
                  <TabsTrigger
                    value="pdf"
                    className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-[#737373] shadow-none data-[state=active]:border-[#2b7fff] data-[state=active]:bg-transparent data-[state=active]:text-[#2b7fff] data-[state=active]:shadow-none"
                  >
                    <Trans>Original PDF</Trans>
                  </TabsTrigger>
                  <TabsTrigger
                    value="adt"
                    className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-[#737373] shadow-none data-[state=active]:border-[#2b7fff] data-[state=active]:bg-transparent data-[state=active]:text-[#2b7fff] data-[state=active]:shadow-none"
                  >
                    <Trans>ADT Book</Trans>
                  </TabsTrigger>
                </TabsList>

                <div className="flex shrink-0 items-center gap-2 pr-3">
                  <ExampleSettings settings={selectedBook.settings} />
                  <DialogPrimitive.Close
                    className="rounded-sm p-1 text-[#737373] transition-colors hover:text-[#0a0a0a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2b7fff]"
                    aria-label={t`Close`}
                  >
                    <X className="h-4 w-4" />
                  </DialogPrimitive.Close>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                {embedUrl ? (
                  activeTab === "adt" ? (
                    <div className="w-full h-full p-4 bg-[#f5f5f5]">
                      <iframe
                        key={embedUrl}
                        src={embedUrl}
                        title={t`ADT Book - ${selectedBook.title}`}
                        className="w-full h-full border-0 rounded-md bg-white"
                      />
                    </div>
                  ) : (
                    <PdfCanvasPreview
                      src={selectedBook.pdfUrl}
                      title={t`Original PDF - ${selectedBook.title}`}
                    />
                  )
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-[#737373]">
                    <Trans>No preview available.</Trans>
                  </div>
                )}
              </div>
            </Tabs>
          </div>

        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
