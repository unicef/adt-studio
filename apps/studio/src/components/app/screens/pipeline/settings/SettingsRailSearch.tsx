import type { KeyboardEvent, RefObject } from "react";
import { Search, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { Kbd } from "@/components/app/ui/Kbd";
import { tint } from "@/components/app/screens/pipeline/shared/plugins";

export interface SettingsRailSearchProps {
    inputRef: RefObject<HTMLInputElement | null>;
    value: string;
    hex: string;
    onChange: (value: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    resultsId?: string;
    activeResultId?: string;
}

export function SettingsRailSearch({
    inputRef,
    value,
    hex,
    onChange,
    onKeyDown,
    resultsId,
    activeResultId,
}: SettingsRailSearchProps) {
    const { t } = useLingui();

    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <input
                ref={inputRef}
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t`Search settings…`}
                aria-label={t`Search settings`}
                role={resultsId ? "combobox" : undefined}
                aria-autocomplete={resultsId ? "list" : undefined}
                aria-controls={resultsId}
                aria-activedescendant={activeResultId}
                aria-expanded={resultsId ? value.length > 0 : undefined}
                style={{ ["--tw-ring-color" as string]: tint(hex, 0.35) }}
                className="h-8 w-full rounded-md border bg-background pl-7 pr-6 text-xs outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 [&::-webkit-search-cancel-button]:hidden"
            />
            {value.length > 0 ? (
                <button
                    type="button"
                    onClick={() => {
                        onChange("");
                        inputRef.current?.focus();
                    }}
                    aria-label={t`Clear search`}
                    className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="size-3" />
                </button>
            ) : (
                <Kbd
                    keys={["/"]}
                    className="[&>kbd]:px-1 [&>kbd]:py-0 [&>kbd]:text-[10px] pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 opacity-70"
                />
            )}
        </div>
    );
}
