import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Plus,
  Upload,
  Cpu,
  LayoutGrid,
  Pencil,
  Package,
  ArrowRight,
  BookOpen,
  Trash2,
  FileText,
  Building2,
  User,
  Globe,
  CheckCircle2,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSettingsDialog } from "@/routes/__root"
import { Badge } from "@/components/ui/badge"
import { DeleteBookDialog } from "@/components/books/DeleteBookDialog"
import { useBooks, useDeleteBook } from "@/hooks/use-books"
import type { BookSummary } from "@/api/client"

export const Route = createFileRoute("/")({
  component: HomePage,
})

const WORKFLOW = [
  {
    icon: Upload,
    title: "Upload PDF",
    desc: "Add your book as a PDF. Each page is extracted as an image ready for AI processing.",
  },
  {
    icon: Cpu,
    title: "Run Pipeline",
    desc: "AI extracts text, classifies content, identifies images, and generates HTML pages.",
  },
  {
    icon: LayoutGrid,
    title: "Review Storyboard",
    desc: "Browse all generated pages side-by-side in a visual grid with the originals.",
  },
  {
    icon: Pencil,
    title: "Edit & Refine",
    desc: "Fine-tune text, prune images, and re-render pages until the output is perfect.",
  },
  {
    icon: Package,
    title: "Export",
    desc: "Download your finished book as ADT, ePub, or WebPub — ready to distribute.",
  },
]

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

function BookRow({
  book,
  onDelete,
}: {
  book: BookSummary
  onDelete: (label: string) => void
}) {
  const hasMetadata = book.title || book.authors.length > 0
  return (
    <div className="group rounded-xl border bg-card transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5">
      <div className="flex items-stretch">
        {/* Main content — clickable */}
        <Link
          to="/books/$label/v2/$step"
          params={{ label: book.label, step: "extract" }}
          className="flex-1 min-w-0 p-5"
        >
          {/* Top: title + badges */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
              <h3 className="font-semibold text-base truncate">
                {book.title ?? book.label}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {book.needsRebuild && (
                <Badge variant="destructive" className="text-[11px] px-2 py-0.5">
                  Needs rebuild
                </Badge>
              )}
              {book.languageCode && (
                <Badge variant="outline" className="text-[11px] px-2 py-0.5">
                  {book.languageCode.toUpperCase()}
                </Badge>
              )}
              {!book.needsRebuild && (
                <Badge
                  variant={book.pageCount > 0 ? "default" : "secondary"}
                  className="text-[11px] px-2 py-0.5"
                >
                  {book.pageCount > 0 ? `${book.pageCount} pages` : "New"}
                </Badge>
              )}
              {book.storyboardAccepted && (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-[11px] px-2 py-0.5">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Accepted
                </Badge>
              )}
              {!book.hasSourcePdf && (
                <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                  No PDF
                </Badge>
              )}
            </div>
          </div>

          {/* Rebuild warning */}
          {book.needsRebuild && (
            <p className="text-sm text-destructive mb-2">
              {book.rebuildReason ?? "Book data is outdated and must be rebuilt."}
            </p>
          )}

          {/* Details */}
          {hasMetadata ? (
            <div className="space-y-1.5">
              {book.title && (
                <DetailRow icon={FileText} label="Label" value={book.label} />
              )}
              {book.authors.length > 0 && (
                <DetailRow
                  icon={User}
                  label={book.authors.length > 1 ? "Authors" : "Author"}
                  value={book.authors.join(", ")}
                />
              )}
              {book.publisher && (
                <DetailRow
                  icon={Building2}
                  label="Publisher"
                  value={book.publisher}
                />
              )}
              {book.languageCode && (
                <DetailRow
                  icon={Globe}
                  label="Language"
                  value={book.languageCode.toUpperCase()}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No metadata yet — run the pipeline to extract book details
            </p>
          )}
        </Link>

        {/* Actions — always visible */}
        <div className="flex flex-col items-center justify-center gap-1 border-l px-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            asChild
          >
            <Link to="/books/$label/v2/$step" params={{ label: book.label, step: "extract" }}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(book.label)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function HomePage() {
  const { data: books, isLoading, error } = useBooks()
  const deleteMutation = useDeleteBook()
  const [deleteLabel, setDeleteLabel] = useState<string | null>(null)
  const { openSettings } = useSettingsDialog()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 text-muted-foreground">
        Loading books...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center flex-1 text-destructive">
        Failed to load books: {error.message}
      </div>
    )
  }

  const bookList = books ?? []

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left — workflow guide (30%) */}
      <div className="w-[30%] shrink-0 border-r bg-muted/30 flex flex-col overflow-auto">
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight text-primary">ADT Studio</h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={openSettings}
              title="API Key Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Accessible Digital Textbooks
          </p>
        </div>

        <div className="px-5 pb-5 flex-1">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            How it works
          </h2>
          <div className="space-y-1">
            {WORKFLOW.map((step, i) => (
              <div
                key={step.title}
                className="flex gap-3 p-3 rounded-lg hover:bg-background/60 transition-colors"
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </div>
                  {i < WORKFLOW.length - 1 && (
                    <div className="w-px flex-1 bg-border" />
                  )}
                </div>
                <div className="min-w-0 pb-2">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <step.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">{step.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/books/new"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors"
          >
            Get started <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Right — books list (70%) */}
      <div className="flex-1 min-w-0 overflow-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            Your Books{bookList.length > 0 && ` (${bookList.length})`}
          </h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/books/new" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Book
            </Link>
          </Button>
        </div>
        <div className="space-y-3">
          {bookList.map((book) => (
            <BookRow
              key={book.label}
              book={book}
              onDelete={setDeleteLabel}
            />
          ))}
          {bookList.length === 0 && (
            <Link to="/books/new" className="block">
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/30 py-16 transition-all hover:border-primary/40 hover:bg-primary/5 cursor-pointer">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
                  <Plus className="h-6 w-6 text-primary" />
                </div>
                <span className="text-sm font-medium">
                  Add your first book
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  Upload a PDF to get started
                </span>
              </div>
            </Link>
          )}
        </div>
      </div>

      <DeleteBookDialog
        label={deleteLabel}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteLabel) {
            deleteMutation.mutate(deleteLabel, {
              onSuccess: () => setDeleteLabel(null),
            })
          }
        }}
        onCancel={() => setDeleteLabel(null)}
      />
    </div>
  )
}
