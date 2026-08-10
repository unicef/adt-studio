export { extractPdf, extractPdfStream, extractPages, computeGroups, renderPdfCover, countPdfPages } from "./extract.js";
export type {
  ExtractInput,
  ExtractedPage,
  ExtractedImage,
  ImageFormat,
  PdfMetadata,
  ExtractResult,
  ExtractStreamResult,
  ExtractProgress,
  ExtractionDebugOutput,
  GroupDebugInfo,
  ShapeDebugInfo,
} from "./extract.js";
export {
  detectTextWatermarks,
  isWatermarkLine,
  stripWatermarkTextLines,
  type WatermarkBBox,
  type WatermarkSignature,
} from "./watermarks.js";
export { renderSvgToPng } from "./svg-render.js";
export { getPngMetadata, decodePng, cropPng, samplePageEdges } from "./png-utils.js";
export type { PngMetadata } from "./png-utils.js";
