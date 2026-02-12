import { formatAnswerValue } from "@/lib/activity-utils"

export function ActivityAnswerPanel({
  answers,
  reasoning,
}: {
  answers: Record<string, string | boolean | number>
  reasoning?: string
}) {
  const entries = Object.entries(answers)
  if (entries.length === 0) return null

  return (
    <div className="rounded border border-green-200 bg-green-50/50 p-3">
      <p className="mb-2 text-xs font-semibold text-green-800">Answer Key</p>
      <div className="space-y-1">
        {entries.map(([id, value]) => (
          <div key={id} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-mono text-muted-foreground truncate">{id}</span>
            <span className="shrink-0 font-medium text-green-900">
              {formatAnswerValue(value)}
            </span>
          </div>
        ))}
      </div>
      {reasoning && (
        <p className="mt-2 border-t border-green-200 pt-2 text-xs text-muted-foreground">
          {reasoning}
        </p>
      )}
    </div>
  )
}
