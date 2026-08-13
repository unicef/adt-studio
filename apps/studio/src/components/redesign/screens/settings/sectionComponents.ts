import type { ComponentType } from "react"
import type { SettingsSection } from "./nav"
import { LanguageSection } from "./LanguageSection"
import { ThemeSection } from "./ThemeSection"
import { NotificationsSection } from "./NotificationsSection"
import { ProvidersSection } from "./ProvidersSection"
import { ModelsSection } from "./ModelsSection"
import { PromptsSection } from "./PromptsSection"
import { AboutSection } from "./AboutSection"

export const SECTION_COMPONENTS: Record<SettingsSection, ComponentType> = {
  language: LanguageSection,
  theme: ThemeSection,
  notifications: NotificationsSection,
  providers: ProvidersSection,
  models: ModelsSection,
  prompts: PromptsSection,
  about: AboutSection,
}
