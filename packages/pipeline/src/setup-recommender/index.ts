export { measureFacts, type MeasuredFacts } from "./facts.js"
export {
  decide,
  factMatters,
  settingsChangedBy,
  BOOK_FACT_IDS,
  BOOK_FACT_OPTIONS,
  LOCKED_SETTINGS,
  SETTING_IDS,
  type BookFacts,
  type BookFactId,
  type Decided,
  type RuleId,
  type SettingId,
} from "./rules.js"
export {
  readQuestions,
  readPageLabels,
  samplePlan,
  suggestRange,
  countLabels,
  type PageLabel,
  type RenderPages,
} from "./readings.js"
export { recommendSetup, type RecommendSetupOptions } from "./recommend.js"
