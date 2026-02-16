import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

interface PromptViewerProps {
  /** Prompt template name to fetch (e.g. "page_sectioning") */
  promptName: string
  /** Human-readable title */
  title: string
  /** Short description shown above the prompt */
  description: string
  /** Current model value */
  model: string
  /** Called when the user changes the model */
  onModelChange: (model: string) => void
  /** Placeholder for the model input */
  modelPlaceholder?: string
  /** Whether to fetch the prompt (set false to defer loading) */
  enabled?: boolean
}

export function PromptViewer({
  promptName,
  title,
  description,
  model,
  onModelChange,
  modelPlaceholder = "openai:gpt-5.2",
  enabled = true,
}: PromptViewerProps) {
  const { data: promptData, isLoading } = useQuery({
    queryKey: ["prompts", promptName],
    queryFn: () => api.getPrompt(promptName),
    enabled,
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          {description}
        </p>
      </div>

      {/* Model picker */}
      <div className="max-w-xs">
        <Label className="text-xs">Model</Label>
        <Input
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={modelPlaceholder}
          className="mt-1 text-xs"
        />
      </div>

      {/* Prompt template */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading prompt...</div>
      ) : promptData?.content ? (
        <pre className="text-xs font-mono bg-muted/50 border rounded-md p-4 overflow-auto max-h-[calc(100vh-200px)] whitespace-pre-wrap">
          {promptData.content}
        </pre>
      ) : (
        <div className="text-sm text-muted-foreground">
          Prompt template not found.
        </div>
      )}
    </div>
  )
}
