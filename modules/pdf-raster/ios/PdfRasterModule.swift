import ExpoModulesCore
import PDFKit
import UIKit
import Vision
import CoreImage

/// Rasterizes the first page of a PDF to a high-res PNG (Apple PDFKit only).
/// Used by Share-to-Log so archived PDF receipts get a crisp hero image while
/// the original PDF stays attached for HD viewing/export.
public final class PdfRasterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfRaster")

    // (uriString: file:// URI or plain path, scale: render multiplier, default 3, clamped 1–5)
    // → file:// path of the PNG in <caches>/pdf-raster/, or nil on ANY failure. Never throws.
    AsyncFunction("renderFirstPageToPng") { (uriString: String, scale: Double) -> String? in
      guard let url = Self.fileUrl(from: uriString),
            let document = PDFDocument(url: url),
            document.pageCount > 0,
            let page = document.page(at: 0) else {
        return nil
      }

      let clampedScale = min(max(scale.isFinite ? scale : 3.0, 1.0), 5.0)
      let mediaBox = page.bounds(for: .mediaBox)
      guard mediaBox.width > 0, mediaBox.height > 0 else { return nil }
      let pixelSize = CGSize(width: mediaBox.width * clampedScale, height: mediaBox.height * clampedScale)

      let renderer = UIGraphicsImageRenderer(size: pixelSize)
      let pngData = renderer.pngData { context in
        // White background — PDF pages are often transparent (renders black otherwise).
        UIColor.white.setFill()
        context.fill(CGRect(origin: .zero, size: pixelSize))

        // Flip UIKit's top-left origin into PDFKit's bottom-left coordinate space.
        context.cgContext.translateBy(x: 0, y: pixelSize.height)
        context.cgContext.scaleBy(x: clampedScale, y: -clampedScale)
        page.draw(with: .mediaBox, to: context.cgContext)
      }

      do {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
          .appendingPathComponent("pdf-raster", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let out = dir.appendingPathComponent("receipt-\(Int(Date().timeIntervalSince1970 * 1000)).png")
        try pngData.write(to: out, options: .atomic)
        return out.absoluteString
      } catch {
        return nil
      }
    }

    // CamScanner-style enhancement for photo receipts (Vision + CoreImage only).
    // (uriString: file:// URI or plain path)
    // → file:// path of the enhanced PNG in <caches>/receipt-enhance/, or nil on
    // ANY failure: unreadable file, no document quad detected, filter/render/
    // write error. Never throws — nil means the caller shares the ORIGINAL photo.
    AsyncFunction("enhanceDocumentImage") { (uriString: String) -> String? in
      guard let url = Self.fileUrl(from: uriString),
            let uiImage = UIImage(contentsOfFile: url.path),
            var ciImage = CIImage(image: uiImage) else {
        return nil
      }

      // CIImage(image:) wraps the RAW CGImage and ignores EXIF orientation, so
      // bake UIImage's parsed orientation into the pixels first — otherwise a
      // portrait receipt shot held sideways is detected/rectified sideways.
      if uiImage.imageOrientation != .up {
        ciImage = ciImage.oriented(CGImagePropertyOrientation(uiImage.imageOrientation))
      }
      guard ciImage.extent.width > 1, ciImage.extent.height > 1 else { return nil }

      // 1–2) Detect the document quad and perspective-correct+crop to it. No
      // quad → nil: an unrectified "enhancement" is worse than the plain photo.
      var working: CIImage
      if #available(iOS 15.0, *) {
        guard let corrected = Self.perspectiveCorrected(ciImage) else { return nil }
        working = corrected
      } else {
        return nil
      }

      // 3) Readability: Apple's document enhancer (iOS 17+ — shadow removal,
      // contrast); below that a near-grayscale contrast boost approximates a
      // clean scan.
      var enhanced: CIImage?
      if #available(iOS 17.0, *) {
        enhanced = CIFilter(name: "CIDocumentEnhancer", parameters: [kCIInputImageKey: working])?.outputImage
      }
      if enhanced == nil {
        enhanced = CIFilter(name: "CIColorControls", parameters: [
          kCIInputImageKey: working,
          kCIInputContrastKey: 1.25,
          kCIInputBrightnessKey: 0.02,
          kCIInputSaturationKey: 0.15,
        ])?.outputImage
      }
      guard let output = enhanced else { return nil }

      // 4) Render to PNG over white (rectified edges can be transparent).
      guard let cgImage = Self.ciContext.createCGImage(output, from: output.extent) else { return nil }
      let size = output.extent.size
      let renderer = UIGraphicsImageRenderer(size: size)
      let pngData = renderer.pngData { context in
        UIColor.white.setFill()
        context.fill(CGRect(origin: .zero, size: size))
        UIImage(cgImage: cgImage).draw(in: CGRect(origin: .zero, size: size))
      }

      do {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
          .appendingPathComponent("receipt-enhance", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let out = dir.appendingPathComponent("enhance-\(Int(Date().timeIntervalSince1970 * 1000)).png")
        try pngData.write(to: out, options: .atomic)
        return out.absoluteString
      } catch {
        return nil
      }
    }
  }

  /// Shared context — creating one per enhance call is needlessly expensive.
  private static let ciContext = CIContext()

  /// Vision document segmentation (iOS 15+) → perspective-corrected image
  /// cropped to the detected quad. Vision's VNRectangleObservation points are
  /// normalized with a BOTTOM-LEFT origin — the SAME orientation as CIImage's
  /// coordinate space, so denormalization is a plain scale+translate, no Y flip.
  @available(iOS 15.0, *)
  private static func perspectiveCorrected(_ image: CIImage) -> CIImage? {
    let request = VNDetectDocumentSegmentationRequest()
    let handler = VNImageRequestHandler(ciImage: image, orientation: .up, options: [:])
    guard (try? handler.perform([request])) != nil,
          let quad = request.results?.first else {
      return nil
    }
    let extent = image.extent
    func denormalize(_ point: CGPoint) -> CIVector {
      CIVector(x: extent.minX + point.x * extent.width, y: extent.minY + point.y * extent.height)
    }
    return CIFilter(name: "CIPerspectiveCorrection", parameters: [
      kCIInputImageKey: image,
      "inputTopLeft": denormalize(quad.topLeft),
      "inputTopRight": denormalize(quad.topRight),
      "inputBottomLeft": denormalize(quad.bottomLeft),
      "inputBottomRight": denormalize(quad.bottomRight),
    ])?.outputImage
  }

  /// Accepts a `file://` URI or a plain filesystem path; anything else → nil.
  private static func fileUrl(from uriString: String) -> URL? {
    if let url = URL(string: uriString), url.scheme != nil {
      return url.isFileURL ? url : nil
    }
    return URL(fileURLWithPath: uriString)
  }
}

/// UIImage.Orientation → CGImagePropertyOrientation for CIImage.oriented(_:).
private extension CGImagePropertyOrientation {
  init(_ uiOrientation: UIImage.Orientation) {
    switch uiOrientation {
    case .up: self = .up
    case .down: self = .down
    case .left: self = .left
    case .right: self = .right
    case .upMirrored: self = .upMirrored
    case .downMirrored: self = .downMirrored
    case .leftMirrored: self = .leftMirrored
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
