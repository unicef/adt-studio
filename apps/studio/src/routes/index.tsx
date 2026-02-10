import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Books</h1>
      <p className="mt-2 text-muted-foreground">
        No books yet. Add your first book to get started.
      </p>
    </div>
  )
}
