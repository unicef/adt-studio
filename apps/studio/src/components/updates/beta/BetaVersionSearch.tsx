import { Trans, useLingui } from "@lingui/react/macro";
import { Search } from "lucide-react";
import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

interface BetaVersionSearchProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export const BetaVersionSearch = forwardRef<
  HTMLInputElement,
  BetaVersionSearchProps
>(function BetaVersionSearch({ value, onValueChange, className }, ref) {
  const { t } = useLingui();

  return (
    <div className={className}>
      <label htmlFor="beta-version-search" className="sr-only">
        <Trans>Search beta versions</Trans>
      </label>
      <Input
        ref={ref}
        id="beta-version-search"
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={t`Search by title, version, contributor, PR, or branch…`}
        autoComplete="off"
        spellCheck={false}
        prependIcon={<Search className="ml-1 size-4" aria-hidden="true" />}
        className="h-10 rounded-xl bg-card pl-9 shadow-sm"
      />
    </div>
  );
});
