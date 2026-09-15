export interface RailPlaceholderProps {
  icon: React.ReactNode
  children: React.ReactNode
}

export function RailPlaceholder({ icon, children }: RailPlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center text-muted-foreground">
      <span className="grid size-9 place-items-center rounded-[10px] bg-muted [&_svg]:size-4">
        {icon}
      </span>
      <span className="text-[11.5px] leading-relaxed text-pretty">{children}</span>
    </div>
  )
}
