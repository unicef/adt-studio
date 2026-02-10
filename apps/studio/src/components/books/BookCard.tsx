import { Link } from "@tanstack/react-router"
import { BookOpen, Trash2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BookSummary } from "@/api/client"

interface BookCardProps {
  book: BookSummary
  onDelete: (label: string) => void
}

export function BookCard({ book, onDelete }: BookCardProps) {
  return (
    <Card className="group relative">
      <Link
        to="/books/$label"
        params={{ label: book.label }}
        className="block"
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">{book.title ?? book.label}</CardTitle>
            </div>
            <Badge variant={book.pageCount > 0 ? "default" : "secondary"}>
              {book.pageCount > 0 ? `${book.pageCount} pages` : "New"}
            </Badge>
          </div>
          {book.title && (
            <CardDescription className="text-xs">{book.label}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="pb-4">
          {book.authors.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {book.authors.join(", ")}
            </p>
          )}
        </CardContent>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.preventDefault()
          onDelete(book.label)
        }}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </Card>
  )
}
