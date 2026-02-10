import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BookList } from "@/components/books/BookList"
import { DeleteBookDialog } from "@/components/books/DeleteBookDialog"
import { useBooks, useDeleteBook } from "@/hooks/use-books"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const { data: books, isLoading, error } = useBooks()
  const deleteMutation = useDeleteBook()
  const [deleteLabel, setDeleteLabel] = useState<string | null>(null)

  if (isLoading) {
    return <div className="text-muted-foreground">Loading books...</div>
  }

  if (error) {
    return (
      <div className="text-destructive">
        Failed to load books: {error.message}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Books</h1>
        {books && books.length > 0 && (
          <Link to="/books/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Book
            </Button>
          </Link>
        )}
      </div>

      <BookList books={books ?? []} onDelete={setDeleteLabel} />

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
