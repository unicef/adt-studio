import { cn } from "@/shared/lib/utils";
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { useIsMobile } from "@/shared/hooks/use-is-mobile"
import { Search as SearchIcon } from "lucide-react"

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> { }

function Container({ children, className, ...props }: ContainerProps) {
  const isMobile = useIsMobile()
  const base = isMobile
    ? "w-full max-w-none p-4 h-[72dvh] flex flex-col gap-2"
    : "w-[var(--dock-width,30rem)] max-w-xl p-4 h-[clamp(20rem,calc(100vh-7rem),600px)] flex flex-col gap-2"
  return (
    <div className={cn(base, className)} {...props}>
      {children}
    </div>
  );
}

interface TitleProps extends React.HTMLAttributes<HTMLHeadingElement> { }

function Title({ children, className, ...props }: TitleProps) {
  return (
    <h4 className={cn("text-lg font-medium leading-tight break-words", className)} {...props} >
      {children}
    </h4>
  );
}


type SearchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
};

function Search({ className, ...props }: SearchProps) {
  const { t } = useTranslation()
  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        placeholder={t("search-placeholder") || "Search"}
        aria-label={t("search-placeholder") || "Search"}
        className="w-full h-11 pl-8 pr-2 text-base rounded-lg bg-muted/50 border border-input outline-none focus:ring-2 focus:ring-ring"
        {...props}
      />
    </div>
  );
}

function Header({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex justify-between items-center", className)} {...props}>
      {children}
    </div>
  );
}

export const DockContent = Object.assign(Container, { Title, Search, Header });
