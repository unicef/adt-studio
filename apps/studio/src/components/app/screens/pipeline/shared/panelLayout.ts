export const MIN_CANVAS_WIDTH = 800

export interface PanelWidths {
  rail: number
  right: number
}

export interface PanelTier extends PanelWidths {
  minViewport: number
}

export const PANEL_TIERS: readonly PanelTier[] = [
  { minViewport: 0, rail: 232, right: 296 },
  { minViewport: 1600, rail: 256, right: 326 },
  { minViewport: 2400, rail: 320, right: 400 },
]

export const RAIL_WIDTH_CLASS = "w-[232px] min-[1600px]:w-[256px] min-[2400px]:w-[320px]"
export const RAIL_LEFT_CLASS = "left-[232px] min-[1600px]:left-[256px] min-[2400px]:left-[320px]"
export const RIGHT_PANEL_WIDTH_CLASS = "w-[296px] min-[1600px]:w-[326px] min-[2400px]:w-[400px]"

export function panelWidths(viewportWidth: number): PanelWidths {
  let tier = PANEL_TIERS[0]
  for (const candidate of PANEL_TIERS) {
    if (viewportWidth >= candidate.minViewport) tier = candidate
  }
  return { rail: tier.rail, right: tier.right }
}

export interface PanelFit {
  rail: boolean
  ai: boolean
}

export function fitPanels(
  rowWidth: number,
  widths: PanelWidths,
  railOpen = true,
  minCanvas = MIN_CANVAS_WIDTH,
): PanelFit {
  const rail = rowWidth - widths.rail < minCanvas
  const railShown = railOpen && !rail ? widths.rail : 0
  return {
    ai: rowWidth - railShown - widths.right < minCanvas,
    rail,
  }
}
