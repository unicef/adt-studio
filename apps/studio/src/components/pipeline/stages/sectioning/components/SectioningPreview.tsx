import type { ReactNode } from "react"
import { ArrowDown, FileText, Image as ImageIcon, Layers, List, Type } from "lucide-react"
import { Trans } from "@lingui/react/macro"

interface InputBlock {
  key: string
  icon: ReactNode
  label: ReactNode
}

interface SectionLeaf {
  icon: ReactNode
  label: ReactNode
  meta?: ReactNode
}

interface Section {
  key: string
  label: ReactNode
  container: ReactNode
  leaves: SectionLeaf[]
}

export function SectioningPreview() {
  const inputBlocks: InputBlock[] = [
    { key: "h", icon: <Type className="w-3 h-3" strokeWidth={2.25} />, label: <Trans>Heading</Trans> },
    { key: "p1", icon: <Type className="w-3 h-3" strokeWidth={2.25} />, label: <Trans>Paragraph</Trans> },
    { key: "l", icon: <List className="w-3 h-3" strokeWidth={2.25} />, label: <Trans>List</Trans> },
    { key: "i", icon: <ImageIcon className="w-3 h-3" strokeWidth={2} />, label: <Trans>Image</Trans> },
    { key: "p2", icon: <Type className="w-3 h-3" strokeWidth={2.25} />, label: <Trans>Paragraph</Trans> },
  ]

  const sections: Section[] = [
    {
      key: "intro",
      label: <Trans>Intro</Trans>,
      container: <Trans>section › group</Trans>,
      leaves: [
        {
          icon: <Type className="w-2.5 h-2.5" strokeWidth={2.25} />,
          label: <Trans>heading</Trans>,
          meta: <Trans>Section 3 · Overview</Trans>,
        },
        {
          icon: <Type className="w-2.5 h-2.5" strokeWidth={2.25} />,
          label: <Trans>paragraph</Trans>,
          meta: <Trans>22 words</Trans>,
        },
      ],
    },
    {
      key: "body",
      label: <Trans>Body</Trans>,
      container: <Trans>section › list</Trans>,
      leaves: [
        {
          icon: <List className="w-2.5 h-2.5" strokeWidth={2.25} />,
          label: <Trans>list_item</Trans>,
          meta: <Trans>Read the prompt aloud</Trans>,
        },
        {
          icon: <List className="w-2.5 h-2.5" strokeWidth={2.25} />,
          label: <Trans>list_item</Trans>,
          meta: <Trans>Identify the key idea</Trans>,
        },
        {
          icon: <List className="w-2.5 h-2.5" strokeWidth={2.25} />,
          label: <Trans>list_item</Trans>,
          meta: <Trans>Try the practice problem</Trans>,
        },
      ],
    },
    {
      key: "activity",
      label: <Trans>Activity</Trans>,
      container: <Trans>section › activity</Trans>,
      leaves: [
        {
          icon: <Type className="w-2.5 h-2.5" strokeWidth={2.25} />,
          label: <Trans>question</Trans>,
          meta: <Trans>multiple choice</Trans>,
        },
        {
          icon: <Layers className="w-2.5 h-2.5" strokeWidth={2.25} />,
          label: <Trans>choice</Trans>,
          meta: <Trans>×4</Trans>,
        },
        {
          icon: <Type className="w-2.5 h-2.5" strokeWidth={2.25} />,
          label: <Trans>answer_key</Trans>,
        },
      ],
    },
  ]

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-col w-full h-full px-5 py-4 gap-3">
        {/* INPUT — extracted blocks */}
        <div className="flex flex-col items-center gap-2 w-full shrink-0">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-sky-600" strokeWidth={2} />
            <span className="font-semibold text-[10px] tracking-[0.18em] uppercase text-sky-700">
              <Trans>Extracted Blocks</Trans>
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {inputBlocks.map((block) => (
              <div
                key={block.key}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-background ring-1 ring-border"
              >
                <span className="text-sky-500">{block.icon}</span>
                <span className="text-[9px] text-sky-700 font-medium leading-none">
                  {block.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CONNECTOR */}
        <div className="flex flex-col items-center shrink-0" aria-hidden>
          <div className="w-px h-2 bg-sky-200" />
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-600 text-white shadow-sm">
            <ArrowDown className="w-3 h-3" strokeWidth={2.5} />
          </div>
          <div className="w-px h-2 bg-sky-200" />
        </div>

        {/* OUTPUT — typed sections (flex-1 fills remaining space) */}
        <div className="flex flex-col items-stretch w-full gap-2 flex-1 min-h-0">
          <span className="font-semibold text-[10px] tracking-[0.18em] uppercase text-sky-700 shrink-0">
            <Trans>Typed Sections</Trans>
          </span>

          <div className="flex flex-col gap-2 flex-1 min-h-0">
            {sections.map((section) => (
              <SectionCard
                key={section.key}
                label={section.label}
                container={section.container}
                leaves={section.leaves}
              />
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-center gap-2 shrink-0">
          <span className="tracking-[0.3em] text-[10px] font-bold text-sky-400">···</span>
          <span className="text-[10px] font-medium text-sky-600/70">
            <Trans>and more sections across the page</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  label,
  container,
  leaves,
}: {
  label: ReactNode
  container: ReactNode
  leaves: SectionLeaf[]
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5 flex flex-col gap-2 flex-1 min-h-0 justify-center">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[9px] tracking-[0.16em] uppercase text-sky-700">
          {label}
        </span>
        <span className="text-sky-300">/</span>
        <span className="font-mono text-[9px] text-sky-500/70">{container}</span>
      </div>
      <div className="flex flex-col gap-1 pl-1">
        {leaves.map((leaf, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] text-sky-300 leading-none select-none">
              {i === leaves.length - 1 ? "└─" : "├─"}
            </span>
            <span className="text-sky-500">{leaf.icon}</span>
            <span className="font-mono text-[10px] text-sky-700">{leaf.label}</span>
            {leaf.meta && (
              <span className="ml-auto text-[10px] text-muted-foreground italic truncate">
                {leaf.meta}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
