import { useState, useRef, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

interface PromptViewerBaseProps {
  /** Prompt template name to fetch (e.g. "page_sectioning") */
  promptName: string
  /** Book label for book-scoped prompt overrides */
  bookLabel?: string
  /** Human-readable title */
  title: string
  /** Short description shown above the prompt */
  description: string
  /** Called when the user edits the prompt content (null = reverted to original) */
  onContentChange?: (content: string | null) => void
  /** Placeholder for the model input */
  modelPlaceholder?: string
  /** Whether to fetch the prompt (set false to defer loading) */
  enabled?: boolean
}

type PromptViewerProps =
  | (PromptViewerBaseProps & { hideModel: true; model?: never; onModelChange?: never })
  | (PromptViewerBaseProps & { hideModel?: false; model: string; onModelChange: (model: string) => void })

/** Simple Liquid template syntax highlighter */
function highlightLiquid(text: string): string {
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

export function PromptViewer({
  promptName,
  bookLabel,
  title,
  description,
  model,
  onModelChange,
  onContentChange,
  modelPlaceholder = "openai:gpt-5.2",
  enabled = true,
  hideModel = false,
}: PromptViewerProps) {
  const { data: promptData, isLoading } = useQuery({
    queryKey: ["prompts", promptName, bookLabel],
    queryFn: () => api.getPrompt(promptName, bookLabel),
    enabled,
  })

  const [draft, setDraft] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)

  // Reset draft when prompt data loads or changes
  useEffect(() => {
    setDraft(null)
    onContentChange?.(null)
  }, [promptData?.content])

  const currentContent = promptData?.content ?? ""
  const displayContent = draft ?? currentContent

  const highlighted = useMemo(() => highlightLiquid(displayContent), [displayContent])

  // Sync scroll between textarea and highlight overlay
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

      {/* Model picker */}
      {!hideModel && (
        <div className="shrink-0 max-w-xs">
          <Label className="text-xs">Model</Label>
          <Input
            value={model ?? ""}
            onChange={(e) => onModelChange?.(e.target.value)}
            placeholder={modelPlaceholder}
            className="mt-1 text-xs"
          />
        </div>
      )}

      {/* Prompt editor */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading prompt...</div>
      ) : promptData?.content != null ? (
        <div className="relative flex-1 min-h-0 border rounded-md overflow-hidden">
          {/* Syntax-highlighted underlay */}
          <pre
            ref={highlightRef}
            aria-hidden
            className="absolute inset-0 text-xs font-mono p-4 whitespace-pre-wrap break-words overflow-auto pointer-events-none bg-muted/50"
            dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
          />
          {/* Editable textarea overlay */}
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
          Prompt template not found.
        </div>
      )}
    </div>
  )
}
