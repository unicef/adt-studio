export {
  SCHEMA_VERSION,
  ImageSource,
  RenderMethodEnum,
  type RenderMethodValue,
  RenderMethod,
  PageRow,
  ImageRow,
  SignLanguageVideoRow,
} from "./db.js"

export {
  type GoogleFontEntry,
  GOOGLE_FONTS,
  normalizeFontKey,
  resolveGoogleFont,
  cssQuoteFamily,
  primaryFontFamily,
  googleFontsCss2Url,
  googleFontsReferencedIn,
} from "./google-fonts.js"

export {
  BookFontSource,
  BookFontRole,
  BookFontCategory,
  BookFontFormat,
  BOOK_FONT_FORMATS,
  BookFontFace,
  BookFontLicense,
  BookFont,
  BookFontRegistry,
  FONT_REGISTRY_NODE,
  FONT_REGISTRY_ITEM_ID,
  FONT_ASSIGNMENT_NODE,
  FONT_ASSIGNMENT_ITEM_ID,
  bookFontIdFromName,
  bookFontsReferencedIn,
  bookBodyFont,
  bookFontFamilyChain,
  classifyFontLicenseOpenSource,
} from "./book-fonts.js"

export {
  FontAssignment,
  FontAssignmentOutput,
} from "./font-assignment.js"

export {
  type FontCategory,
  type DetectedFontCategory,
  type ReflowableFont,
  type ReflowableFontSetting,
  REFLOWABLE_FONTS,
  REFLOWABLE_FONT_SETTINGS,
  resolveReflowableFont,
  reflowableFontFamilyChain,
  reflowableFontChain,
  classifyFontCategoryByName,
} from "./reflowable-fonts.js"

export {
  StepName,
  StageName,
  type StepDef,
  type StageDef,
  PIPELINE,
  STAGE_ORDER,
  STEP_TO_STAGE,
  STAGE_BY_NAME,
  ALL_STEP_NAMES,
  PAGE_PROGRESS_STEPS,
  BOOK_LEVEL_STAGES,
} from "./pipeline.js"

export {
  type PipelineNodeName,
  type PipelineCacheResource,
  STAGE_OUTPUT_NODES,
  getStageClearOrder,
  getStageClearNodes,
  getStageRerunClearNodes,
  getCacheResourcesForNode,
  getCacheResourcesForNodes,
  getCacheResourcesForStageOutput,
  getCacheResourcesForStageClear,
} from "./pipeline-effects.js"

// NOTE: fingerprint.* is intentionally NOT re-exported here. It imports
// `node:crypto`, which is unavailable in the browser, and this root barrel is
// imported by the Studio SPA (for PIPELINE and friends). Node-only consumers
// import it from the "@adt/types/fingerprint" subpath instead.

export { PartRange, PartManifest, ExportedPartEntry, PartsLedger } from "./part.js"

export { ProgressEvent } from "./progress.js"

export {
  PageErrorPolicy,
  PageErrorAction,
  PendingDecision,
  DecisionBody,
} from "./page-error.js"

export {
  TaskKind,
  TaskStatus,
  TaskEvent,
  TaskInfo,
} from "./task.js"

export { BookLabel, BookSummary, BookDetail, parseBookLabel } from "./book.js"

export {
  BookFormat,
  LayoutType,
  StyleguideName,
  DEFAULT_LLM_MAX_RETRIES,
  StepConfig,
  QuizGenerationConfig,
  EasyReadConfig,
  PageSectioningConfig,
  RenderType,
  VisualRefinementStrategyConfig,
  RenderStrategyConfig,
  AccessibilityAssessmentConfig,
  AppConfig,
  type TypeDef,
} from "./config.js"

export {
  ContentNodeData,
  PageSectioningSection,
  PageSectioningOutput,
  buildPageSectioningLLMSchema,
  buildPageSectioningRefinementLLMSchema,
  // Out-of-band placement sidecar — PDF coordinates, image clip/blend/opacity,
  // viewport dimensions. Carried alongside the semantic tree on
  // `PageSectioningSection.placement` so any renderer can use it.
  TextPosition,
  SectionTextSegment,
  ImagePartBounds,
  SectionViewport,
  NodePlacement,
} from "./page-sectioning.js"

export {
  findNode,
  findNodePath,
  editLeafText,
  setLeafRole,
  setContainerStructure,
  toggleNodePruned,
  deleteNode,
  duplicateNode,
  moveNode,
  addLeaf,
  addImageLeaf,
  addContainer,
  nestNode,
  unnestNode,
  splitContainerBefore,
  splitNodesBefore,
  mergeContainerWithPrevious,
  mergeAdjacentContainers,
  replaceNodeId,
  cloneNodeWithNewIds,
  collectPrunedLeafIds,
  collectLeafIdsInSubtree,
  collectLeafNodes,
  type IdFactory,
  type NodeLocation,
} from "./section-tree-ops.js"

export {
  ImageFilters,
  ImageClassificationResult,
  ImageClassificationOutput,
} from "./image-filtering.js"

export {
  imageMeaningfulnessLLMSchema,
} from "./image-meaningfulness.js"

export {
  ImageCropResult,
  ImageCroppingOutput,
  imageCroppingLLMSchema,
} from "./image-cropping.js"

export {
  ImageSegmentRegion,
  ImageSegmentResult,
  ImageSegmentationOutput,
  imageSegmentationLLMSchema,
} from "./image-segmentation.js"

export { BookMetadata } from "./metadata.js"

export { BookSummaryOutput } from "./book-summary.js"

export { ExtractionWarning } from "./extraction-warning.js"

export {
  SectionRendering,
  WebRenderingOutput,
  webRenderingLLMSchema,
  activityAnswersLLMSchema,
  visualReviewLLMSchema,
  editVerifyLLMSchema,
} from "./web-rendering.js"

export {
  ImageCaption,
  ImageCaptioningOutput,
  imageCaptioningLLMSchema,
} from "./image-captioning.js"

export {
  GlossaryItem,
  GlossaryOutput,
  glossaryLLMSchema,
} from "./glossary.js"

export {
  QuizOption,
  Quiz,
  QuizGenerationOutput,
  quizLLMSchema,
} from "./quiz.js"

export {
  TextCatalogEntry,
  TextCatalogOutput,
  TextCatalogCategory,
  getTextCatalogCategory,
} from "./text-catalog.js"

export {
  EasyReadEntry,
  EasyReadSectionBlock,
  EasyReadOutput,
} from "./easy-read.js"

export {
  TTSProviderConfig,
  SpeechConfig,
  isSpeechWordHighlightingEnabled,
  type TtsExclusionConfig,
  isTtsExcluded,
  SpeechFileEntry,
  SpeechFailedEntry,
  TTSOutput,
  WordTimestamp,
  WordTimestampEntry,
  WordTimestampOutput,
} from "./speech.js"

export {
  StyleguideGenerationOutput,
} from "./styleguide-generation.js"

export {
  TocEntry,
  TocGenerationOutput,
  tocLLMSchema,
} from "./toc.js"

export {
  AccessibilityNodeResult,
  AccessibilityFinding,
  AccessibilityPageResult,
  BrowserAccessibilityPageResult,
  AccessibilityAssessmentSummary,
  BrowserAccessibilityAssessmentSummary,
  AccessibilityAssessmentOutput,
  BrowserAccessibilityAssessmentOutput,
} from "./accessibility.js"

export {
  ReviewerValidationConfig,
  type ReviewerValidationCatalog,
} from "./reviewer-validation-config.js"

export {
  PositionedParagraph,
  PositionedTextOutput,
  ImageBounds,
  DrawItem,
  DrawItemImage,
  DrawItemParagraph,
  TextSegment,
  TextBlockBounds,
} from "./positioned-text.js"

export {
  ReviewerValidationStatus,
  ReviewerValidationFieldType,
  ReviewerValidationIdentificationField,
  ReviewerValidationInstruction,
  ReviewerValidationCriterion,
  ReviewerValidationSection,
  ReviewerValidationCatalogSnapshot,
  ReviewerValidationSession,
  ReviewerPageValidationResult,
  ReviewerPageValidationRecord,
} from "./reviewer-validation.js"

export {
  screenshotIpcViewportSchema,
  screenshotIpcRequestSchema,
  screenshotIpcCloseSchema,
  screenshotIpcUtilityToMainSchema,
  screenshotIpcReplySuccessSchema,
  screenshotIpcReplyErrorSchema,
  screenshotIpcReplySchema,
  type ScreenshotIpcUtilityToMain,
  type ScreenshotIpcReply,
} from "./screenshot-ipc.js"

export {
  accessibilityAuditIpcViewportSchema,
  accessibilityAuditIpcRequestSchema,
  accessibilityAuditIpcCloseSchema,
  accessibilityAuditIpcUtilityToMainSchema,
  accessibilityAuditIpcReplySuccessSchema,
  accessibilityAuditIpcReplyErrorSchema,
  accessibilityAuditIpcReplySchema,
  type AccessibilityAuditIpcUtilityToMain,
  type AccessibilityAuditIpcReply,
} from "./accessibility-audit-ipc.js"
