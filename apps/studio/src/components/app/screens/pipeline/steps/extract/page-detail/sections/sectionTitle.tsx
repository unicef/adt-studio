import { Trans } from "@lingui/react/macro"
import type { PageDetailData } from "../usePageDetailData"
import type { SectionKind } from "./types"

export function SectionTitle({ kind, data }: { kind: SectionKind; data: PageDetailData }) {
  if (kind === "images") return <Trans>Images · {data.entries.length}</Trans>
  if (kind === "text") return <Trans>Text</Trans>
  return <Trans>Fonts · {data.page?.fonts?.length ?? 0}</Trans>
}
