import { useState, useEffect } from "react"
import Editor, { type BeforeMount } from "@monaco-editor/react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useQuery } from "@tanstack/react-query"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import { api } from "@/api/client"
import { Trans, useLingui } from "@lingui/react/macro"
import { ModelSelect, LLM_MODEL_GROUPS, type ModelGroup } from "./ModelSelect"

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

type PromptViewerProps =
  | (PromptViewerBaseProps & { hideModel: true; model?: never; onModelChange?: never })
  | (PromptViewerBaseProps & { hideModel?: false; model: string; onModelChange: (model: string) => void })

export interface PromptDraft {
  content: string
  modelId: string | null
}

export function toPromptDraft(content: string | null, modelId: string | null): PromptDraft | null {
  return content == null ? null : { content, modelId }
}

const PROMPT_EDITOR_LANGUAGE = "adt-liquid"
const PROMPT_EDITOR_THEME = "adt-studio-light"
const PROMPT_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  wordWrap: "on",
  wrappingIndent: "same",
  fontSize: 12,
  lineHeight: 20,
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Monaco font stack, not UI copy.
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  detectIndentation: false,
  renderLineHighlight: "line",
  renderWhitespace: "selection",
  stickyScroll: { enabled: false },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  padding: { top: 12, bottom: 12 },
  scrollbar: {
    alwaysConsumeMouseWheel: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
} as const

const configurePromptEditor: BeforeMount = (monaco) => {
  const hasLanguage = monaco.languages
    .getLanguages()
    .some((language: { id: string }) => language.id === PROMPT_EDITOR_LANGUAGE)

  if (!hasLanguage) {
    monaco.languages.register({ id: PROMPT_EDITOR_LANGUAGE })
  }

  monaco.languages.setMonarchTokensProvider(PROMPT_EDITOR_LANGUAGE, {
    tokenizer: {
      root: [
        [/\{#[\s\S]*?#\}/, "comment"],
        [/\{%[\s\S]*?%\}/, "keyword"],
        [/\{\{[\s\S]*?\}\}/, "variable"],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        [/\b(true|false|null|nil|and|or|not|in|contains)\b/, "operator"],
        [/\b(if|else|elsif|endif|case|when|for|endfor|assign|capture|endcapture|include|render)\b/, "keyword"],
      ],
    },
  })

  monaco.languages.setLanguageConfiguration(PROMPT_EDITOR_LANGUAGE, {
    brackets: [
      ["{{", "}}"],
      ["{%", "%}"],
      ["{#", "#}"],
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "{{", close: "}}" },
      { open: "{%", close: "%}" },
      { open: "{#", close: "#}" },
      { open: "\"", close: "\"" },
      { open: "'", close: "'" },
      { open: "(", close: ")" },
      { open: "[", close: "]" },
    ],
    surroundingPairs: [
      { open: "\"", close: "\"" },
      { open: "'", close: "'" },
      { open: "(", close: ")" },
      { open: "[", close: "]" },
    ],
  })

  monaco.editor.defineTheme(PROMPT_EDITOR_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "64748b", fontStyle: "italic" },
      { token: "keyword", foreground: "7c3aed" },
      { token: "operator", foreground: "0f766e" },
      { token: "string", foreground: "b45309" },
      { token: "variable", foreground: "2563eb" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#111827",
      "editor.lineHighlightBackground": "#f8fafc",
      "editor.selectionBackground": "#ccfbf1",
      "editor.inactiveSelectionBackground": "#e2e8f0",
      "editorCursor.foreground": "#0f766e",
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#0f766e",
      "editorGutter.background": "#ffffff",
      "editorIndentGuide.background1": "#e5e7eb",
      "editorIndentGuide.activeBackground1": "#cbd5e1",
      "scrollbarSlider.background": "#cbd5e166",
      "scrollbarSlider.hoverBackground": "#94a3b880",
      "scrollbarSlider.activeBackground": "#64748b99",
    },
  })
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
  modelPlaceholder = "openai:gpt-5.4",
  modelGroups = LLM_MODEL_GROUPS,
  enabled = true,
  hideModel = false,
  readOnly = false,
}: PromptViewerProps) {
  const { t } = useLingui()
  const promptModelId = hideModel ? null : promptModelForSelectedModel(model)

  const { data: promptData, isLoading } = useQuery({
    queryKey: ["prompts", promptName, bookLabel, promptModelId],
    queryFn: () => api.getPrompt(promptName, bookLabel, promptModelId),
    enabled,
  })

  const [draft, setDraft] = useState<string | null>(null)

  // Reset draft when prompt data loads or changes
  useEffect(() => {
    setDraft(null)
    onContentChange?.(null, promptModelId)
  }, [promptData?.content, promptModelId])

  const currentContent = promptData?.content ?? ""
  const displayContent = draft ?? currentContent

  const onChange = (value: string) => {
    setDraft(value)
    onContentChange?.(value === currentContent ? null : value, promptModelId)
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-col gap-3 p-4">
      <div className="shrink-0 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {title}
        </h3>
        <p className="max-w-4xl text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="flex min-h-[560px] w-full flex-1 flex-col overflow-hidden rounded-md border bg-background">
        {!hideModel && (
          <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
            <div className="flex min-w-72 flex-1 items-center gap-2 sm:max-w-[28rem]">
              <Label className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t`Model`}
              </Label>
              <ModelSelect
                value={model ?? ""}
                onChange={(v) => onModelChange?.(v)}
                placeholder={modelPlaceholder}
                groups={modelGroups}
                className="min-w-0 flex-1"
                inputClassName="h-9 text-xs"
              />
            </div>
            {onMaxRetriesChange && (
              <div className="flex items-center gap-2">
                <Label className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t`Retries`}
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={maxRetries ?? ""}
                  onChange={(e) => onMaxRetriesChange(e.target.value)}
                  placeholder={String(DEFAULT_LLM_MAX_RETRIES)}
                  className="h-9 w-20 text-xs"
                />
              </div>
            )}
          </div>
        )}

        {/* Prompt editor */}
        <div className="min-h-[520px] flex-1 overflow-hidden">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">
              <Trans>Loading prompt...</Trans>
            </div>
          ) : promptData?.content != null ? (
            <Editor
              value={displayContent}
              language={PROMPT_EDITOR_LANGUAGE}
              theme={PROMPT_EDITOR_THEME}
              beforeMount={configurePromptEditor}
              height="100%"
              width="100%"
              onChange={(value) => onChange(value ?? "")}
              options={{
                ...PROMPT_EDITOR_OPTIONS,
                readOnly,
              }}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              <Trans>Prompt template not found.</Trans>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function promptModelForSelectedModel(modelId: string | undefined): string | null {
  if (!modelId) return null
  const normalized = modelId.trim().toLowerCase()
  if (normalized === "gpt-5.5" || normalized === "openai:gpt-5.5") return "openai:gpt-5.5"
  return null
}
