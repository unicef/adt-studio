import { BookOpen, Plus } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { BookCard } from "./BookCard"
import type { BookSummary } from "@/api/client"

interface BookListProps {
  books: BookSummary[]
  onDelete: (label: string) => void
}

export function BookList({ books, onDelete }: BookListProps) {
  if (books.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {books.map((book) => (
        <BookCard key={book.label} book={book} onDelete={onDelete} />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
      <BookOpen className="h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-semibold">No books yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your first book to get started.
      </p>
      <Link to="/books/new">
        <Button className="mt-4">
          <Plus className="mr-2 h-4 w-4" />
          Add Book
        </Button>
      </Link>
    </div>
  )
}
