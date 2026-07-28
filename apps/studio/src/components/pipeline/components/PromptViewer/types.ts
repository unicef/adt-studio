import type { ModelGroup } from "../ModelSelect"

export interface PromptViewerBaseProps {
  /** Prompt template name to fetch (e.g. "page_sectioning") */
  promptName: string
  /** Book label for book-scoped prompt overrides */
  bookLabel?: string
  /** Human-readable title */
  title: string
  /** Short description shown above the prompt */
  description: string
  /** Draft content owned by the parent so tab remounts keep pending edits. */
  draft?: PromptDraft | null
  /** Called when the user edits the prompt content (null = reverted to original) */
  onContentChange?: (content: string | null, modelId: string | null) => void
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

export type PromptViewerProps =
  | (PromptViewerBaseProps & { hideModel: true; model?: never; onModelChange?: never })
  | (PromptViewerBaseProps & { hideModel?: false; model: string; onModelChange: (model: string) => void })

export interface PromptDraft {
  content: string
  modelId: string | null
}

export function toPromptDraft(content: string | null, modelId: string | null): PromptDraft | null {
  return content == null ? null : { content, modelId }
}
