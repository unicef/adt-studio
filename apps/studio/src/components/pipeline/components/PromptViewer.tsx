import { useState, useRef, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useQuery } from "@tanstack/react-query"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import { api } from "@/api/client"
import { Trans, useLingui } from "@lingui/react/macro"
import { ModelSelect, LLM_MODEL_GROUPS, type ModelGroup } from "./ModelSelect"
import { useApiKey } from "@/hooks/use-api-key"

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
  /** Current max retries value (as string for input binding) */
  maxRetries?: string
  /** Called when the user changes the retries value */
  onMaxRetriesChange?: (value: string) => void
  /** Placeholder for the model input */
  modelPlaceholder?: string
  /** Model groups for the dropdown. Defaults to LLM_MODEL_GROUPS. */
  modelGroups?: ModelGroup[]
  /** Whether to fetch the prompt (set false to defer loading) */
  enabled?: boolean
  /** When true, the prompt is shown as a read-only preview (no editing). */
  readOnly?: boolean
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
  maxRetries,
  onMaxRetriesChange,
  modelPlaceholder,
  modelGroups = LLM_MODEL_GROUPS,
  enabled = true,
  hideModel = false,
  readOnly = false,
}: PromptViewerProps) {
  const { t } = useLingui()
  const { defaultModel, hasOpenAIKey, hasAnthropicKey, hasGoogleKey, hasCustomProvider } = useApiKey()
  const disabledProviders = modelGroups
    .filter((group) =>
      group.provider === "openai" ? !hasOpenAIKey
        : group.provider === "anthropic" ? !hasAnthropicKey
          : group.provider === "google" ? !hasGoogleKey
            : group.provider === "custom" ? !hasCustomProvider
              : false
    )
    .map((group) => group.provider)

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
        <div className="shrink-0 flex items-end gap-3">
          <div className="min-w-0 max-w-xs flex-1">
            <Label className="text-xs">{t`Model`}</Label>
            <ModelSelect
              value={model ?? ""}
              onChange={(v) => onModelChange?.(v)}
              placeholder={modelPlaceholder ?? defaultModel ?? ""}
              groups={modelGroups}
              disabledProviders={disabledProviders}
              className="mt-1"
              inputClassName="text-xs"
            />
          </div>
          {onMaxRetriesChange && (
            <div className="w-20">
              <Label className="text-xs">{t`Retries`}</Label>
              <Input
                type="number"
                min={0}
                value={maxRetries ?? ""}
                onChange={(e) => onMaxRetriesChange(e.target.value)}
                placeholder={String(DEFAULT_LLM_MAX_RETRIES)}
                className="mt-1 text-xs"
              />
            </div>
          )}
        </div>
      )}

      {/* Prompt editor */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">
          <Trans>Loading prompt...</Trans>
        </div>
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
            readOnly={readOnly}
            className="relative w-full h-full text-xs font-mono p-4 whitespace-pre-wrap break-words bg-transparent text-transparent caret-foreground resize-none outline-none"
            style={{ WebkitTextFillColor: "transparent" }}
          />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          <Trans>Prompt template not found.</Trans>
        </div>
      )}
    </div>
  )
}
