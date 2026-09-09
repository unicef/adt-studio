import Editor from "@monaco-editor/react"
import { Trans } from "@lingui/react/macro"
import {
  configurePromptEditor,
  PROMPT_EDITOR_LANGUAGE,
  PROMPT_EDITOR_OPTIONS,
  promptEditorTheme,
} from "@/components/pipeline/components/PromptViewer/promptEditor"
import { useIsDarkMode } from "@/hooks/use-dark-mode"
import { PromptEditorSkeleton } from "./PromptSettingsSkeletons"

type PromptEditorPaneProps = {
  isLoading: boolean
  content: string | undefined
  displayContent: string
  onChange: (value: string) => void
}

export function PromptEditorPane({
  isLoading,
  content,
  displayContent,
  onChange,
}: PromptEditorPaneProps) {
  const isDark = useIsDarkMode()

  if (isLoading) return <PromptEditorSkeleton />

  if (content == null) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <Trans>Prompt template not found.</Trans>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <Editor
        value={displayContent}
        language={PROMPT_EDITOR_LANGUAGE}
        theme={promptEditorTheme(isDark)}
        beforeMount={configurePromptEditor}
        height="100%"
        width="100%"
        onChange={(value) => onChange(value ?? "")}
        options={PROMPT_EDITOR_OPTIONS}
      />
    </div>
  )
}
