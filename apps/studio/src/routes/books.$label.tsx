import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useBook } from "@/hooks/use-books"

export const Route = createFileRoute("/books/$label")({
  component: BookDetailPage,
})

function BookDetailPage() {
  const { label } = Route.useParams()
  const navigate = useNavigate()
  const { data: book, isLoading, error } = useBook(label)

  if (isLoading) {
    return <div className="text-muted-foreground">Loading book...</div>
  }

  if (error) {
    return (
      <div className="text-destructive">
        Failed to load book: {error.message}
      </div>
    )
  }

  if (!book) return null

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => navigate({ to: "/" })}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Books
      </Button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {book.title ?? book.label}
          </h1>
          {book.title && (
            <p className="text-sm text-muted-foreground">{book.label}</p>
          )}
        </div>
        <Badge variant={book.pageCount > 0 ? "default" : "secondary"}>
          {book.pageCount > 0 ? `${book.pageCount} pages` : "New"}
        </Badge>
      </div>

      <div className="space-y-4">
        {book.metadata && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {book.metadata.title && (
                  <>
                    <dt className="text-muted-foreground">Title</dt>
                    <dd>{book.metadata.title}</dd>
                  </>
                )}
                {book.metadata.authors.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Authors</dt>
                    <dd>{book.metadata.authors.join(", ")}</dd>
                  </>
                )}
                {book.metadata.publisher && (
                  <>
                    <dt className="text-muted-foreground">Publisher</dt>
                    <dd>{book.metadata.publisher}</dd>
                  </>
                )}
                {book.metadata.language_code && (
                  <>
                    <dt className="text-muted-foreground">Language</dt>
                    <dd>{book.metadata.language_code}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>
              {book.pageCount > 0
                ? "Pipeline has been run on this book."
                : "Run the pipeline to extract and process this book."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled>
              Run Pipeline
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Pipeline execution will be available in the next update.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
