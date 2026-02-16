import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const LANGUAGES = [
  { code: "fr", label: "French", progress: 100 },
  { code: "es", label: "Spanish", progress: 72 },
  { code: "sw", label: "Swahili", progress: 45 },
]

const MOCK_TRANSLATIONS: Record<string, { original: string; translated: string }[]> = {
  fr: [
    { original: "Water is essential for all living things on Earth.", translated: "L'eau est essentielle pour tous les \u00eatres vivants sur Terre." },
    { original: "The water cycle describes how water moves through the environment.", translated: "Le cycle de l'eau d\u00e9crit comment l'eau circule dans l'environnement." },
    { original: "Plants absorb water through their roots.", translated: "Les plantes absorbent l'eau par leurs racines." },
  ],
  es: [
    { original: "Water is essential for all living things on Earth.", translated: "El agua es esencial para todos los seres vivos en la Tierra." },
    { original: "The water cycle describes how water moves through the environment.", translated: "El ciclo del agua describe c\u00f3mo el agua se mueve a trav\u00e9s del medio ambiente." },
    { original: "Plants absorb water through their roots.", translated: "Las plantas absorben agua a trav\u00e9s de sus ra\u00edces." },
  ],
  sw: [
    { original: "Water is essential for all living things on Earth.", translated: "Maji ni muhimu kwa viumbe vyote vilivyo hai duniani." },
    { original: "The water cycle describes how water moves through the environment.", translated: "Mzunguko wa maji unaelezea jinsi maji yanavyosogea katika mazingira." },
    { original: "Plants absorb water through their roots.", translated: "" },
  ],
}

export function TranslationsView({ bookLabel: _ }: { bookLabel: string }) {
  const [selectedLang, setSelectedLang] = useState("fr")
  const translations = MOCK_TRANSLATIONS[selectedLang] ?? []
  const langInfo = LANGUAGES.find((l) => l.code === selectedLang)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Translations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {LANGUAGES.length} languages configured
          </p>
        </div>
      </div>

      {/* Language selector */}
      <div className="flex gap-1.5">
        {LANGUAGES.map((lang) => (
          <Button
            key={lang.code}
            variant={selectedLang === lang.code ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedLang(lang.code)}
            className="text-xs h-7 gap-1.5"
          >
            {lang.label}
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] h-4 px-1",
                selectedLang === lang.code && "bg-white/20 text-white"
              )}
            >
              {lang.progress}%
            </Badge>
          </Button>
        ))}
      </div>

      {/* Progress bar */}
      {langInfo && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-pink-500 rounded-full transition-all"
              style={{ width: `${langInfo.progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{langInfo.progress}% complete</span>
        </div>
      )}

      {/* Side-by-side translations */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3 px-3 py-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Original</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{langInfo?.label}</span>
        </div>
        {translations.map((item, i) => (
          <div key={i} className="grid grid-cols-2 gap-3 px-3 py-2.5 rounded-md border bg-card">
            <p className="text-xs leading-relaxed">{item.original}</p>
            <p className={cn("text-xs leading-relaxed", !item.translated && "text-muted-foreground italic")}>
              {item.translated || "Pending translation..."}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
