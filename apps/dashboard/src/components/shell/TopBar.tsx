import { PRICE_TIERS, type PriceTier } from "../../lib/pricing"

const TIER_LABELS: Record<PriceTier, string> = { short: "Short context", long: "Long context" }

export function TopBar({ tier, onTier }: { tier: PriceTier; onTier: (tier: PriceTier) => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
      <div className="flex min-h-14 flex-wrap items-center gap-2.5 px-4 py-2 lg:px-6">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-accent text-white">
          <svg viewBox="0 0 16 16" className="size-4">
            <path d="M3 12.5V8m3.3 4.5V4m3.4 8.5V6.5m3.3 6V3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <h1 className="text-sm font-medium text-ink">ADT Conversion Compare</h1>
        <div className="ml-auto flex items-center gap-2">
          <span id="price-tier-label" className="text-xs text-muted">Token prices</span>
          <div className="inline-flex overflow-hidden rounded-md border border-line bg-surface" role="group" aria-labelledby="price-tier-label">
            {PRICE_TIERS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tier === t}
                onClick={() => onTier(t)}
                className="px-3 py-1 text-xs text-muted transition-colors duration-150 hover:text-ink aria-pressed:bg-page aria-pressed:font-medium aria-pressed:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
              >
                {TIER_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
