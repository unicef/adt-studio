import { useState } from "react";
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save";
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard";
import { SettingsDirtyTabsProvider } from "@/hooks/use-settings-dirty-tabs";
import { SettingsRemountProvider } from "@/hooks/use-settings-remount";
import { SettingsReturnProvider } from "@/hooks/use-settings-return";
import { useBook } from "@/hooks/use-books";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { TopBar } from "@/components/title-bar/TopBar";
import { useSettingsAnchor } from "@/components/app/screens/settings/useSettingsAnchor";
import { BookSettingsBody } from "./BookSettingsBody";
import { BookSettingsSidebar } from "./BookSettingsSidebar";
import { bookSettingsScope } from "./sections";

export interface BookSettingsScreenProps {
    label: string;
    section: string;
    onSelectSection: (section: string, anchor?: string) => void;
    onBack: () => void;
}

export function BookSettingsScreen(props: BookSettingsScreenProps) {
    return (
        <FloatingSaveProvider>
            <SettingsDirtyTabsProvider>
                <SettingsReturnProvider value={props.onBack}>
                    <UnsavedChangesGuard />
                    <BookSettingsFrame {...props} />
                </SettingsReturnProvider>
            </SettingsDirtyTabsProvider>
        </FloatingSaveProvider>
    );
}

function BookSettingsFrame({
    label,
    section,
    onSelectSection,
    onBack,
}: BookSettingsScreenProps) {
    const [discardNonce, setDiscardNonce] = useState(0);
    const { data: book, error } = useBook(label);
    useSettingsAnchor();
    const fullWidth = bookSettingsScope(section) === "storyboard";

    const body = (
        <SettingsRemountProvider
            value={() => setDiscardNonce((nonce) => nonce + 1)}
        >
            <BookSettingsBody
                key={discardNonce}
                label={label}
                book={book}
                bookError={(error as Error | null) ?? null}
                section={section}
            />
        </SettingsRemountProvider>
    );

    return (
        <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
            <BookSettingsSidebar
                book={book}
                label={label}
                section={section}
                onSelectSection={onSelectSection}
                onBack={onBack}
            />

            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <TopBar className="absolute inset-x-0 top-0 z-[3] drag-region" />
                {fullWidth ? (
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto pb-20 pt-1">
                        <div className="p-4 pb-0">
                            <span className="capitalize font-bold text-xl">
                                {section}
                            </span>
                        </div>
                        {body}
                    </div>
                ) : (
                    <ScrollArea className="flex min-h-0 flex-1 flex-col">
                        <ScrollBar className="z-10" />
                        <div className="mx-auto w-full max-w-[860px] px-[34px] pb-20 pt-10">
                            {body}
                        </div>
                    </ScrollArea>
                )}
            </div>
        </div>
    );
}
