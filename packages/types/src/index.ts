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
  ModelDefaultKind,
  type StepDef,
  type StageDef,
  PIPELINE,
  STAGE_ORDER,
  STEP_TO_STAGE,
  STAGE_BY_NAME,
  ALL_STEP_NAMES,
  STEPS_BY_DEFAULT_MODEL_KIND,
  PAGE_PROGRESS_STEPS,
  BOOK_LEVEL_STAGES,
} from "./pipeline.js"

export {
  type PipelineNodeName,
  type PipelineCacheResource,
  STAGE_OUTPUT_NODES,
  IMAGE_SET_CHANGE_CLEAR_NODE_TYPES,
  IMAGE_SET_CHANGE_CLEAR_STEPS,
  IMAGE_SET_CHANGE_CLEAR_STAGES,
  getStageClearOrder,
  getStageDependents,
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
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  DEFAULT_ELEVENLABS_TTS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  DEFAULT_ELEVENLABS_VOICE_SETTINGS,
  ELEVENLABS_SHIPPED_VOICE_NAMES,
  LLMModelId,
  SpeechGenerationModelId,
  DefaultModelConfig,
  SpecializedModelDefaultsConfig,
  StepConfig,
  QuizGenerationConfig,
  EasyReadConfig,
  PageSectioningConfig,
  RenderType,
  VisualRefinementStrategyConfig,
  RenderStrategyConfig,
  AccessibilityAssessmentConfig,
  EpubGlossaryMode,
  EpubGlossaryConfig,
  AgentsConfig,
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
export {
  HeadingLevel,
  HeadingKind,
  HEADING_ROLE_LEVELS,
  isHeadingRole,
  headingLevelForRole,
  BookOutlineStyleCluster,
  BookOutlineEntry,
  BookOutlineOutput,
  BookOutlineProposalEntry,
  BookOutlineProposalOutput,
  BookOutlineAppliedHeading,
  BookOutlineAuditResponse,
} from "./book-outline.js"

export { ExtractionWarning } from "./extraction-warning.js"

export {
  FIXED_LAYOUT_MAX_SCALE,
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
  EDITABLE_ACTIVITY_NODE,
  BLANK_MARKER_RE,
  blankItemIdsInText,
  ActivityImage,
  ActivityText,
  FitbBlank,
  FitbSentence,
  FitbStep,
  McOption,
  McStep,
  OpenEndedStep,
  UnderlineToken,
  UnderlineStep,
  StepFeedback,
  EditableActivityTheme,
  EditableActivity,
  EditableActivitiesEntity,
  activityFeedbackLLMSchema,
  ActivityOutlineText,
  ActivityOutlineInput,
  ActivityOutlineOption,
  ActivityOutlineChoice,
  ActivityOutlineItem,
  ActivityOutline,
} from "./editable-activity.js"

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
  CoreTtsTransformationKind,
  CoreTtsEntryStatus,
  CoreTtsGenerationMode,
  CoreTtsGenerationMetadata,
  CoreTtsCatalogEntry,
  CoreTtsCatalogOutput,
  CoreTtsConfig,
  containsLatexSpeechCandidate,
} from "./core-tts.js"

export {
  EasyReadEntry,
  EasyReadSectionBlock,
  EasyReadOutput,
} from "./easy-read.js"

export {
  TTSProviderConfig,
  TTSRateLimitConfig,
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
  AUTO_FIT_SCRIPT_SRC,
  PositionedParagraph,
  PositionedTextOutput,
  ImageBounds,
  DrawItem,
  DrawItemImage,
  DrawItemParagraph,
  TextSegment,
  TextBlockBounds,
} from "./positioned-text.js"

export { TypeScale } from "./type-scale.js"

export { TypographyStyle, BookTypography, DEFAULT_TYPOGRAPHY } from "./typography.js"

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
  DEFAULT_TRANSLATION_EVALUATION_CONTEXT_OPTIONS,
  DEFAULT_TRANSLATION_EVALUATION_ISSUE_TYPES,
  DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS,
  DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL,
  DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES,
  DEFAULT_TRANSLATION_EVALUATION_SEVERITY_THRESHOLD,
  DEFAULT_TRANSLATION_EVALUATION_TEMPERATURE,
  TranslationEvaluationConfig,
  TranslationEvaluationContextOptions,
  TranslationEvaluationIssueType,
  TranslationEvaluationSeverity,
  TranslationEvaluationSummary,
  TranslationEvaluationItem,
  TranslationEvaluationProvider,
  TranslationEvaluationJudgeMetadata,
  TranslationEvaluationMetadata,
  TranslationEvaluationRunEntry,
  TranslationEvaluationRunPage,
  TranslationEvaluationRunRequest,
  TranslationEvaluationResult,
  type ResolvedTranslationEvaluationConfig,
  resolveTranslationEvaluationConfig,
} from "./translation-evaluation.js"

export {
  PUBLISH_WORKER_VERSION,
  R2_FREE_TIER_BYTES,
  PUBLICATION_SNAPSHOT_MAX_BYTES,
  PUBLICATION_TOKEN_LENGTH,
  PUBLICATION_ACCESS_COOKIE,
  PUBLICATION_ACCESS_MAX_AGE_SECONDS,
  PUBLICATION_ACCESS_CODE_MIN_LENGTH,
  PUBLICATION_ACCESS_CODE_MAX_LENGTH,
  PUBLICATION_ACCESS_CODE_LENGTH,
  PUBLICATION_ACCESS_CODE_ALPHABET,
  PublicationAccessCode,
  PublicationAccessRequest,
  PublicationToken,
  PublicationState,
  PublicationPageEntry,
  PublicationVersion,
  Publication,
  PublicationCreateRequest,
  PublicationCreateResponse,
  PublicationFileUploadResponse,
  PublicationVersionCreateRequest,
  PublicationVersionCreateResponse,
  PublicationExpiryUpdateRequest,
  PublicationUpdateRequest,
  PublicationResponse,
  PublicationDetail,
  PublicationListEntry,
  PublicationList,
  PublicationReader,
  PublicationReaderList,
  PublicationDeleteResult,
  PublicationSummary,
  PublicationsTotals,
  PublicationsOverview,
  PublishWorkerHealth,
  PublishErrorCode,
  PublishErrorResponse,
  PUBLISH_STEPS,
  PUBLISH_STEP_COUNT,
  PublishStepId,
  PublishStepDescriptor,
  PublishStepStatus,
  PublishStepEventStatus,
  PublishErrorCodeStudio,
  PublishStepEvent,
  PublishCompleteEvent,
  PublishErrorEvent,
  PublishProgressEvent,
  BookPublicationVersionRecord,
  BookPublicationRecord,
  BookPublicationStatus,
  BookPublishRequest,
  PublishFeatureSelection,
  publicationStateAt,
} from "./publication.js"

export { COMMENTER_NAME_MAX_LENGTH, CommenterDisplayName } from "./commenter-name.js"

export {
  COMMENTER_SESSION_COOKIE,
  COMMENTER_SESSION_MAX_AGE_SECONDS,
  COMMENTER_PIN_MIN_LENGTH,
  COMMENTER_PIN_MAX_LENGTH,
  COMMENTER_COLORS,
  PUBLISH_COMMENT_BODY_MAX_LENGTH,
  PUBLISH_AUTHOR_NAME_HEADER,
  PUBLISH_AUTHOR_DEFAULT_NAME,
  PUBLISH_AUTHOR_COLOR,
  CommentAnchor,
  CommenterSession,
  PublishComment,
  CommenterPin,
  CommenterSessionCreateRequest,
  CommenterSessionClaimRequest,
  CommenterSessionResponse,
  PublishCommentCreateRequest,
  PublishCommentUpdateRequest,
  PublishCommentResolveRequest,
  PublishCommentListQuery,
  PublishCommentListResponse,
  PublishCommentResponse,
} from "./publish-comment.js"

export {
  PUBLICATION_ROOM_MAX_PEERS,
  PUBLICATION_ROOM_MAX_FRAME_BYTES,
  PUBLICATION_ROOM_TICKET_TTL_SECONDS,
  PUBLICATION_ROOM_TAB_PARAM,
  PUBLICATION_ROOM_TAB_PATTERN,
  PUBLICATION_ROOM_TICKET_PARAM,
  PUBLICATION_ROOM_CURSOR_THROTTLE_MS,
  PUBLICATION_ROOM_CURSOR_STALE_MS,
  PUBLISH_ANONYMOUS_NAME,
  PUBLISH_ANONYMOUS_COLOR,
  ROOM_COMMENT_EVENTS,
  RoomPeer,
  RoomHelloFrame,
  RoomCursorMoveFrame,
  RoomPageFrame,
  RoomDevice,
  RoomDeviceFrame,
  RoomClientFrame,
  RoomPresenceFrame,
  RoomPeerCursorFrame,
  RoomPeerViewportFrame,
  RoomViewportFrame,
  RoomCommentEvent,
  RoomCommentFrame,
  RoomServerFrame,
  PublicationRoomTicketResponse,
} from "./publication-room.js"

export {
  CLOUDFLARE_TOKEN_HEADER,
  CLOUDFLARE_ACCOUNT_ID_HEADER,
  CLOUDFLARE_WORKER_NAME,
  CLOUDFLARE_D1_DATABASE_NAME,
  CLOUDFLARE_R2_BUCKET_NAME,
  CLOUDFLARE_REQUIRED_SCOPES,
  PROVISION_STEPS,
  PROVISION_STEP_COUNT,
  CloudflareTokenScope,
  CloudflareVerifyResponse,
  CloudflareAuthMethod,
  CloudflareOAuthErrorCode,
  CloudflareOAuthFlowStatus,
  CloudflareOAuthAccount,
  CloudflareOAuthStartResponse,
  CloudflareOAuthStatusResponse,
  CloudflareOAuthAccountRequest,
  CloudflareOAuthAccountResponse,
  ProvisionStepId,
  ProvisionStepStatus,
  ProvisionStepDescriptor,
  ProvisionErrorCode,
  CloudflareConnectionResources,
  CloudflareConnectionStatus,
  CloudflareConnectionDeleteResponse,
  ProvisionProgressEvent,
  provisionStep,
  workersDevUrl,
} from "./cloudflare.js"

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
