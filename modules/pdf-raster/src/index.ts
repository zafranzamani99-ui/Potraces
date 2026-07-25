import { requireOptionalNativeModule } from 'expo';

type PdfRasterModuleType = {
  renderFirstPageToPng(uriString: string, scale: number): Promise<string | null>;
  enhanceDocumentImage(uriString: string): Promise<string | null>;
};

// null when the module isn't in this build (old dev clients, Android, tests).
const PdfRaster = requireOptionalNativeModule<PdfRasterModuleType>('PdfRaster');

/**
 * Rasterize a PDF's first page to a high-res PNG (white background) written to
 * the app's caches dir. Returns the PNG file:// URI, or null on any failure.
 */
export async function renderPdfFirstPageToPng(uri: string, scale = 3): Promise<string | null> {
  if (!PdfRaster) return null;
  try {
    return await PdfRaster.renderFirstPageToPng(uri, scale);
  } catch {
    return null;
  }
}

/**
 * CamScanner-style enhancement for a photo receipt (iOS only): Vision document
 * detection → perspective correction → document enhancer, written as a PNG in
 * the app's caches dir. Returns the enhanced file:// URI, or null on ANY
 * failure (including "no document quad found") — caller uses the original.
 */
export async function enhanceDocumentImage(uri: string): Promise<string | null> {
  if (!PdfRaster) return null;
  try {
    return await PdfRaster.enhanceDocumentImage(uri);
  } catch {
    return null;
  }
}
