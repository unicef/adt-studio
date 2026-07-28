export {
  type Progress,
  nullProgress,
  createConsoleProgress,
} from "./progress.js"
export { processWithConcurrency } from "./concurrency.js"
export { extractPDF, type ExtractOptions } from "./pdf-extraction.js"
export {
  detectSpreads,
  type SpreadEdgeSample,
  type SpreadSuggestion,
  type SpreadDetectionOptions,
} from "./spread-detection.js"
export {
  sectionPage,
  runValidator as validatePageSectioning,
  finalizePageSectioning,
  flattenTreeToText,
  mapLeafTexts,
  countLeafTexts,
  buildPageSectioningConfig,
  type PageSectioningConfig,
  type PageSectioningInput,
} from "./page-sectioning.js"
export {
  classifyPageImages,
  buildImageClassifyConfig,
  type ImageClassifyConfig,
} from "./image-filtering.js"
export {
  filterPageImageMeaningfulness,
  buildMeaningfulnessConfig,
  type MeaningfulnessConfig,
  type MeaningfulnessPageInput,
} from "./image-meaningfulness.js"
export {
  cropPageImages,
  applyCrops,
  applyCrop,
  buildCroppingConfig,
  getCroppedImageId,
  type AppliedCrop,
  type CroppingConfig,
  type CroppingPageInput,
} from "./image-cropping.js"
export {
  segmentPageImages,
  applySegmentation,
  segmentBoundsOnPage,
  buildSegmentationConfig,
  getSegmentedImageId,
  type AppliedSegment,
  type SegmentationConfig,
  type SegmentationPageInput,
} from "./image-segmentation.js"
export { grayscaleStdDev } from "./image-complexity.js"
export {
  extractMetadata,
  buildMetadataConfig,
  type MetadataConfig,
  type MetadataPageInput,
} from "./metadata-extraction.js"
export {
  generateBookSummary,
  buildBookSummaryConfig,
  type BookSummaryConfig,
  type BookSummaryPageInput,
} from "./book-summary.js"
export {
  renderPage,
  buildRenderStrategyResolver,
  buildRenderContext,
  collectReferencedImageIds,
  collectSourcePageImages,
  GROUP_CONTAINER_STRUCTURES,
  type RenderConfig,
  type VisualRefinementConfig,
  type RenderPageInput,
  type RenderSectionInput,
  type RenderContext,
  type RenderNode,
  type LeafText,
  type ImageRef,
} from "./web-rendering.js"
export { renderSectionLlm, type VisualRefinementDeps } from "./render-llm.js"
export {
  DEFAULT_VISUAL_REVIEW_MODEL_ID,
  runVisualReviewLoop,
  type VisualReviewDeps,
  type RunVisualReviewLoopOptions,
  type VisualReviewResult,
  type VisualReviewValidation,
} from "./visual-review.js"
export {
  createScreenshotRenderer,
  SCREENSHOT_VIEWPORTS,
  getViewportBreakpoints,
  type ScreenshotRenderer,
} from "./screenshot.js"
export { buildScreenshotHtml } from "./screenshot-html.js"
export {
  createTemplateEngine,
  renderSectionTemplate,
  type TemplateEngine,
} from "./render-template.js"
export {
  getBaseLanguage,
  normalizeLocale,
  buildLanguageContext,
  buildTranslationLanguageContext,
  type LanguageContext,
  type TranslationLanguageContext,
} from "./language-context.js"
export {
  translatePageTree,
  buildTranslationConfig,
  shouldTranslate,
  type TranslationConfig,
} from "./translation.js"
export {
  captionPageImages,
  buildCaptionConfig,
  collectCaptionImageIds,
  groupGlossaryImageIdsByPage,
  extractImageIds,
  type CaptionConfig,
  type CaptionPageInput,
} from "./image-captioning.js"
export {
  generateGlossary,
  regenerateGlossaryPreservingEdits,
  generateGlossaryItem,
  buildGlossaryConfig,
  stripHtml,
  collectPageTexts,
  getGlossaryItemTextId,
  isManualGlossaryItem,
  isPrunedGlossaryItem,
  getPrunedGlossaryWords,
  mergeGeneratedGlossaryWithManualItems,
  type GlossaryConfig,
  type GenerateGlossaryOptions,
  type GenerateGlossaryItemOptions,
  type GeneratedGlossaryItemFields,
} from "./glossary.js"
export {
  generateToc,
  buildTocGenerationConfig,
  type TocGenerationConfig,
  type GenerateTocOptions,
} from "./toc-generation.js"
export { validateSectionHtml } from "./validate-html.js"
export {
  generateQuiz,
  generateAllQuizzes,
  buildQuizGenerationConfig,
  extractTextFromHtml,
  isContentPage,
  batchPages,
  type QuizConfig,
  type QuizPageInput,
} from "./quiz-generation.js"
export { buildTextCatalog } from "./text-catalog.js"
export {
  buildEasyReadConfig,
  buildEasyReadSourceBlocks,
  buildPageEasyReadBlocks,
  createEmptyEasyReadOutput,
  generateEasyRead,
  rewriteBlockEasyRead,
  flattenEasyReadEntries,
  DEFAULT_EASY_READ_MODEL_ID,
  EMPTY_EASY_READ_GENERATED_AT,
  isDeterministicEmptyEasyReadOutput,
  type EasyReadConfig,
  type GenerateEasyReadOptions,
} from "./easy-read.js"
export {
  resolveVoice,
  resolveInstructions,
  resolveProviderForLanguage,
  resolveSpeechModel,
  resolveSpeechFormat,
  resolveGeminiTtsRateLimit,
  getDocumentedGeminiTtsRpm,
  type ResolvedGeminiTtsRateLimit,
  isSpeakableText,
  stripEmojis,
  loadVoicesConfig,
  loadSpeechInstructions,
  computeSpeechCacheKey,
  generateSpeechFile,
  generatePageSpeechFiles,
  generateWordTimestamps,
  type VoiceMaps,
  type InstructionsMap,
  type GenerateSpeechFileOptions,
  type GeneratePageSpeechFilesOptions,
  type GenerateWordTimestampsOptions,
  type GenerateWordTimestampsResult,
  type ProviderRouting,
} from "./speech.js"
export {
  parseWavHeader,
  wavDurationSeconds,
  sliceWav,
  findQuietCutSeconds,
  type WavInfo,
} from "./audio-wav.js"
export { supportsPageBatchedSpeech } from "./speech-batch.js"
export {
  translateCatalogBatch,
  buildCatalogTranslationConfig,
  getTargetLanguages,
  type CatalogTranslationConfig,
} from "./catalog-translation.js"
export {
  translateImage,
  buildImageTranslationConfig,
  type TranslateImageOptions,
  type TranslatedImageResult,
} from "./image-translation.js"
export {
  generateStyleguide,
  buildStyleguideGenerationConfig,
  type StyleguideGenerationConfig,
  type StyleguideGenerationInput,
} from "./styleguide-generation.js"
export {
  detectFontFormat,
  parseFontMetadata,
  type ParsedFontMetadata,
} from "./font-metadata.js"
export {
  resolveFontsCacheDir,
  readCachedGoogleFont,
  parseCss2FontFaces,
  fetchGoogleFontFaces,
  validateGoogleFamily,
  ensureGoogleFontsCached,
  ensureBookGoogleFontsCached,
  parseGoogleFontsCatalog,
  fetchGoogleFontsCatalog,
  type GoogleCatalogFamily,
  readBookFontRegistry,
  buildBookFontsPromptContext,
  type BookFontPromptEntry,
  bundleBookFontsIntoCss,
  type CachedGoogleFont,
  type EnsureCachedResult,
  type FontsCacheFetchers,
  type BundleBookFontsOptions,
} from "./fonts-bundle.js"
export {
  generateFontAssignment,
  buildFontAssignmentConfig,
  type FontAssignmentConfig,
  type FontAssignmentInput,
} from "./font-assignment.js"
export { applyFontToHtml, type FontScope } from "./font-apply.js"
export { loadConfig, loadBookConfig, deepMerge } from "./config.js"
export { runFullPipeline, type FullPipelineOptions } from "./pipeline-dag.js"
export {
  runDAG,
  runPipelineDAG,
  type DAGNode,
  type DAGResult,
  type NodeStatus,
  type StepExecutor,
  type PipelineDAGResult,
} from "./dag.js"
export {
  packageEpub,
  type PackageEpubOptions,
} from "./packaging/epub.js"
export { packageWebpub } from "./packaging/webpub.js"
export { buildPreviewTailwindCss } from "./tailwind.js"
export { htmlToXhtml } from "./html-semantics.js"
export {
  packageAdtWeb,
  computePackagingInputHash,
  type PackageAdtWebOptions,
  type ComputePackagingInputHashOptions,
  renderPageHtml,
  resolveReflowableFontChain,
  NAV_HTML,
  type RenderPageOptions,
  buildGlossaryJson,
  buildImageMap,
  buildPreferredImageAltMap,
  buildDecorativeImageIdSet,
  rewriteImageUrls,
  renderQuizHtml,
  type QuizStyle,
  buildQuizAnswers,
  pad3,
  convertLatexToMathml,
} from "./packaging/web.js"
export {
  resolveQuizPalette,
  deriveQuizPalette,
  DEFAULT_QUIZ_PALETTE,
  type QuizPalette,
} from "./quiz-palette.js"
export {
  tallyFontSizes,
  mergeTallies,
  deriveTypeScale,
  deriveTypeScaleFromHistogram,
  readTypeScale,
  TYPE_SCALE_NODE,
  TYPE_SCALE_ITEM,
} from "./type-scale.js"
export {
  readTypography,
  resolveDetectedTypography,
  buildTypographyCss,
  resolveTypographyCss,
  typographyPreservationErrors,
  TYPOGRAPHY_NODE,
  TYPOGRAPHY_ITEM,
} from "./typography.js"
export {
  runAccessibilityAssessment,
  type RunAccessibilityAssessmentOptions,
} from "./accessibility-assessment.js"
export {
  runBrowserAccessibilityAssessment,
  buildBrowserAccessibilityRecheckPlan,
  type RunBrowserAccessibilityAssessmentOptions,
  type BrowserAccessibilityRecheckTarget,
  type BuildBrowserAccessibilityRecheckPlanOptions,
} from "./browser-accessibility-assessment.js"
export { mergeAccessibilityResults } from "./accessibility-assessment-shared.js"
export { processFixedLayoutPages, isFixedLayoutBook } from "./fixed-layout-rendering.js"
export {
  getRenderSectioning,
  getRenderSectioningRow,
  getSemanticSectioning,
  FIXED_LAYOUT_SECTIONING_NODE,
  PAGE_SECTIONING_NODE,
} from "./render-sectioning.js"
