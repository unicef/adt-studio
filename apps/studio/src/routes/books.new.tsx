import { useState, useCallback } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Upload, ArrowLeft, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useCreateBook } from "@/hooks/use-books"

export const Route = createFileRoute("/books/new")({
  component: AddBookPage,
})

function AddBookPage() {
  const navigate = useNavigate()
  const createMutation = useCreateBook()
  const [label, setLabel] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const suggestLabel = useCallback((filename: string) => {
    return filename
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/^-+/, "")
      .toLowerCase()
  }, [])

  const handleFileSelect = (selected: File) => {
    setFile(selected)
    if (!label) {
      setLabel(suggestLabel(selected.name))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === "application/pdf") {
      handleFileSelect(dropped)
    }
  }

  const handleSubmit = () => {
    if (!file || !label) return
    createMutation.mutate(
      { label, pdf: file },
      {
        onSuccess: (book) => {
          navigate({ to: "/books/$label", params: { label: book.label } })
        },
      }
    )
  }

  const isValid = !!file && !!label && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(label)

  return (
    <div className="mx-auto max-w-2xl">
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => navigate({ to: "/" })}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Books
      </Button>

      <h1 className="mb-6 text-2xl font-bold">Add Book</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload PDF</CardTitle>
            <CardDescription>
              Select or drag a PDF file to process.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => {
                const input = document.createElement("input")
                input.type = "file"
                input.accept = ".pdf"
                input.onchange = () => {
                  const selected = input.files?.[0]
                  if (selected) handleFileSelect(selected)
                }
                input.click()
              }}
            >
              {file ? (
                <>
                  <FileText className="h-10 w-10 text-primary" />
                  <p className="mt-2 text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Drag and drop a PDF here, or click to browse
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Book Label</CardTitle>
            <CardDescription>
              A unique identifier for this book (letters, numbers, hyphens,
              dots).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., my-textbook-grade5"
              className="max-w-md"
            />
            {label && !isValid && (
              <p className="mt-1 text-xs text-destructive">
                Must start with a letter or number, containing only letters,
                numbers, hyphens, dots, and underscores.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/" })}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Book"}
          </Button>
        </div>

        {createMutation.isError && (
          <p className="text-sm text-destructive">
            {createMutation.error.message}
          </p>
        )}
      </div>
    </div>
  )
}
