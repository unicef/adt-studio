import { PromptsSection } from "@/components/app/screens/settings/PromptsSection"

export function GlobalPromptsSettings({ embedded = false }: { embedded?: boolean } = {}) {
  return <div className={embedded ? "flex min-h-0 flex-1 flex-col gap-4" : "flex h-full flex-col gap-4 p-4"}><PromptsSection /></div>
}
