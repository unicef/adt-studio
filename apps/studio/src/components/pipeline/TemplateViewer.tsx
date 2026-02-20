import { useState, useRef, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

interface TemplateViewerProps {
  /** Template name to fetch (e.g. "two_column_render") */
  templateName: string
  /** Book label for book-scoped template overrides */
  bookLabel?: string
  /** Human-readable title */
  title: string
  /** Short description shown above the editor */
  description: string
  /** Called when the user edits the template content (null = reverted to original) */
  onContentChange?: (content: string | null) => void
}

/** Syntax highlighter for Liquid + HTML templates */
function highlightTemplate(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  return escaped
    // Liquid output tags: {{ ... }}
    .replace(/(\{\{[\s\S]*?\}\})/g, '<span class="text-blue-400">$1</span>')
    // Liquid control tags: {% ... %}
    .replace(/(\{%[\s\S]*?%\})/g, '<span class="text-purple-400">$1</span>')
    // Liquid comments: {# ... #}
    .replace(/(\{#[\s\S]*?#\})/g, '<span class="text-gray-500">$1</span>')
}

export function TemplateViewer({
  templateName,
  bookLabel,
  title,
  description,
  onContentChange,
}: TemplateViewerProps) {
  const { data: templateData, isLoading } = useQuery({
    queryKey: ["templates", templateName, bookLabel],
    queryFn: () => api.getTemplate(templateName, bookLabel),
  })

  const [draft, setDraft] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)

  // Reset draft when template data loads or changes
  useEffect(() => {
    setDraft(null)
    onContentChange?.(null)
  }, [templateData?.content])

  const currentContent = templateData?.content ?? ""
  const displayContent = draft ?? currentContent

  const highlighted = useMemo(() => highlightTemplate(displayContent), [displayContent])

  const syncScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  const onChange = (value: string) => {
    setDraft(value)
    onContentChange?.(value === currentContent ? null : value)
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="shrink-0">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading template...</div>
      ) : templateData?.content != null ? (
        <div className="relative flex-1 min-h-0 border rounded-md overflow-hidden">
          <pre
            ref={highlightRef}
            aria-hidden
            className="absolute inset-0 text-xs font-mono p-4 whitespace-pre-wrap break-words overflow-auto pointer-events-none bg-muted/50"
            dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
          />
          <textarea
            ref={textareaRef}
            value={displayContent}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            spellCheck={false}
            className="relative w-full h-full text-xs font-mono p-4 whitespace-pre-wrap break-words bg-transparent text-transparent caret-foreground resize-none outline-none"
            style={{ WebkitTextFillColor: "transparent" }}
          />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Template not found.
        </div>
      )}
    </div>
  )
}
