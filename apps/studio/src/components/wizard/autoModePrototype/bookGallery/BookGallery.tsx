import { useEffect, useMemo, useState } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { FlowTopBar } from "@/components/FlowTopBar"
import { cn } from "@/lib/utils"
import { Book3D } from "../upload/Book3D"
import { UploadScreen } from "../upload/UploadScreen"
import { useUploadFlow, type UploadFlow } from "../upload/useUploadFlow"
import { SAMPLE_BOOKS, type SampleBook } from "./samples"

function fakeFile(book: SampleBook) {
  const file = new File([], book.fileName, { type: "application/pdf", lastModified: 0 })
  Object.defineProperty(file, "size", { value: book.size })
  return file
}

function mockFlow(flow: UploadFlow, book: SampleBook, file: File): UploadFlow {
  return {
    ...flow,
    file,
    fileKey: book.id,
    title: book.title,
    pageCount: book.pages,
    cover: book.cover,
    loading: false,
    error: null,
    replacing: false,
    accepted: true,
    showCard: true,
    openPicker: () => {},
    clear: () => {},
    onContinue: () => {},
  }
}

/** Lab: the upload card's loaded state with real sample covers, switchable one by one or as a shelf. */
export function BookGallery() {
  const flow = useUploadFlow()
  const [index, setIndex] = useState(0)
  const [view, setView] = useState<"screen" | "shelf">("screen")
  const book = SAMPLE_BOOKS[index]
  const file = useMemo(() => (book ? fakeFile(book) : null), [book])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % SAMPLE_BOOKS.length)
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + SAMPLE_BOOKS.length) % SAMPLE_BOOKS.length)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (!book || !file) return <EmptyGallery />

  return (
    <>
      {view === "screen" ? (
        <UploadScreen flow={mockFlow(flow, book, file)} />
      ) : (
        <Shelf
          onPick={(i) => {
            setIndex(i)
            setView("screen")
          }}
        />
      )}
      <Switcher index={index} view={view} onIndex={setIndex} onView={setView} />
    </>
  )
}

function Shelf({ onPick }: { onPick: (index: number) => void }) {
  const { t } = useLingui()
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <FlowTopBar title={t`Cover gallery`} />
      <div className="flex-1 overflow-y-auto px-12 pb-32 pt-12">
        <div className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-10 gap-y-14">
          {SAMPLE_BOOKS.map((sample, i) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => onPick(i)}
              className="group flex flex-col items-center gap-5 rounded-3xl p-4 text-center transition-colors hover:bg-brand-50/60 animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="grid h-[230px] place-items-end">
                <Book3D src={sample.cover} alt={sample.title} height={210} maxWidth={200} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="line-clamp-2 text-[14px] font-semibold leading-snug">{sample.title}</span>
                <span className="text-[12px] text-muted-foreground">
                  <Plural value={sample.pages} one="# page" other="# pages" />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Switcher({ index, view, onIndex, onView }: { index: number; view: "screen" | "shelf"; onIndex: (i: number) => void; onView: (v: "screen" | "shelf") => void }) {
  const { t } = useLingui()
  const count = SAMPLE_BOOKS.length
  const book = SAMPLE_BOOKS[index]
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border bg-white/90 p-1.5 shadow-lg backdrop-blur">
      <div className="flex shrink-0 rounded-xl bg-muted p-0.5 text-[12px] font-medium">
        {(["screen", "shelf"] as const).map((v) => (
          <button key={v} type="button" onClick={() => onView(v)} className={cn("rounded-[10px] px-3 py-1.5 transition-colors", view === v ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {v === "screen" ? <Trans>Screen</Trans> : <Trans>Shelf</Trans>}
          </button>
        ))}
      </div>
      {view === "screen" && (
        <>
          <button type="button" aria-label={t`Previous book`} onClick={() => onIndex((index - 1 + count) % count)} className="grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-muted active:scale-[0.97]">
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto px-0.5 py-1">
            {SAMPLE_BOOKS.map((sample, i) => (
              <button
                key={sample.id}
                type="button"
                title={sample.title}
                onClick={() => onIndex(i)}
                className={cn("h-10 shrink-0 overflow-hidden rounded-[5px] ring-2 ring-offset-1 transition-[box-shadow,opacity,transform] duration-200 hover:-translate-y-0.5", i === index ? "ring-brand-500" : "opacity-60 ring-transparent hover:opacity-100")}
              >
                {sample.cover ? <img src={sample.cover} alt={sample.title} className="h-full w-auto" /> : <span className="block h-full w-7 bg-muted" />}
              </button>
            ))}
          </div>
          <button type="button" aria-label={t`Next book`} onClick={() => onIndex((index + 1) % count)} className="grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-muted active:scale-[0.97]">
            <ChevronRight className="size-4" />
          </button>
          <span className="shrink-0 whitespace-nowrap pr-2 text-[12px] tabular-nums text-muted-foreground">
            {index + 1} / {count} · <Plural value={book?.pages ?? 0} one="# page" other="# pages" />
          </span>
        </>
      )}
    </div>
  )
}

function EmptyGallery() {
  return (
    <div className="grid h-full flex-1 place-items-center p-10 text-center text-[14px] text-muted-foreground">
      <p className="max-w-md">
        <Trans>No sample books found. Put first-page PNGs and a books.json manifest in .context/auto-mode/books/ to use this gallery.</Trans>
      </p>
    </div>
  )
}
