import { Card, Swatch } from "../Card"
import { fmtDec1, fmtInt } from "../../lib/format"
import type { RunView } from "../../lib/run-view"

export function ModelTable({ runs }: { runs: RunView[] }) {
  return (
    <Card id="models" title="By model" note="modelId recorded on each llm_log call.">
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr className="text-right">
              <th className="px-2 py-1.5 text-left font-medium">Conversion</th>
              <th className="px-2 py-1.5 text-left font-medium">Model</th>
              <th className="px-2 py-1.5 font-medium">Calls</th>
              <th className="px-2 py-1.5 font-medium">Input tokens</th>
              <th className="px-2 py-1.5 font-medium">Output tokens</th>
              <th className="px-2 py-1.5 font-medium">Summed time (s)</th>
            </tr>
          </thead>
          <tbody>
            {runs.flatMap((run) =>
              [...run.metrics.byModel]
                .sort((a, b) => b.calls - a.calls)
                .map((m) => (
                  <tr key={`${run.metrics.name}|${m.model}`} className="border-t border-line text-right">
                    <td className="whitespace-nowrap px-2 py-1.5 text-left">
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch color={run.color} />
                        {run.metrics.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-left">{m.model}</td>
                    <td className="px-2 py-1.5">{fmtInt(m.calls)}</td>
                    <td className="px-2 py-1.5">{fmtInt(m.inputTokens)}</td>
                    <td className="px-2 py-1.5">{fmtInt(m.outputTokens)}</td>
                    <td className="px-2 py-1.5">{fmtDec1(m.sumS)}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
