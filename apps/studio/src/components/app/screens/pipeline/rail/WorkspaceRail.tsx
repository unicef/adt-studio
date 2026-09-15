import { useLingui } from "@lingui/react/macro"
import type { QuizItem } from "@/api/client"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { useRailTab } from "@/components/app/screens/pipeline/shared/workspacePrefs"
import { LayersRail } from "./LayersRail"
import { PagesRail } from "./PagesRail"
import { PagesRailEmpty } from "./PagesRailEmpty"
import { PaletteRail } from "./PaletteRail"
import { RailTabs } from "./RailTabs"

export interface WorkspaceRailProps {
  label: string
  pages: PipelinePage[]
  quizzes: QuizItem[]
  activePageId: string | null
  activeQuizIndex: number | null
  onSelect: (pageId: string) => void
  onSelectQuiz: (quizIndex: number) => void
  storyboardRunning: boolean
  outdatedPageIds: ReadonlySet<string>
  empty: boolean
  imageCount: number
  extracting: boolean
  editable: boolean
}

function RailPane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div hidden={!active} className={active ? "flex min-h-0 flex-1 flex-col" : undefined}>
      {children}
    </div>
  )
}

export function WorkspaceRail({
  label,
  pages,
  quizzes,
  activePageId,
  activeQuizIndex,
  onSelect,
  onSelectQuiz,
  storyboardRunning,
  outdatedPageIds,
  empty,
  imageCount,
  extracting,
  editable,
}: WorkspaceRailProps) {
  const { t } = useLingui()
  const [tab, setTab] = useRailTab()
  const active = editable ? tab : "pages"

  return (
    <aside
      aria-label={t`Book index`}
      className="flex h-full w-72 shrink-0 flex-col border-r bg-card"
    >
      <RailTabs value={active} onChange={setTab} editable={editable} />

      <RailPane active={active === "pages"}>
        {empty ? (
          <PagesRailEmpty
            pageCount={pages.length}
            imageCount={imageCount}
            extracting={extracting}
          />
        ) : (
          <PagesRail
            label={label}
            pages={pages}
            quizzes={quizzes}
            activePageId={activePageId}
            activeQuizIndex={activeQuizIndex}
            onSelect={onSelect}
            onSelectQuiz={onSelectQuiz}
            storyboardRunning={storyboardRunning}
            outdatedPageIds={outdatedPageIds}
          />
        )}
      </RailPane>

      <RailPane active={active === "layers"}>
        <LayersRail editable={editable} />
      </RailPane>

      <RailPane active={active === "palette"}>
        <PaletteRail editable={editable} />
      </RailPane>
    </aside>
  )
}
