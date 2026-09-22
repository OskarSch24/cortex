import Foundation
import Vision
import CoreImage
import ImageIO

enum ImageFailure: Error, LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
}

// Vision supplies a real foreground alpha mask, without an image-generation call.
// https://developer.apple.com/documentation/vision/vninstancemaskobservation
@available(macOS 14.0, *)
func removeBackground(source: URL, destination: URL) throws {
    guard let input = CGImageSourceCreateWithURL(source as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(input, 0, nil) as? [CFString: Any],
          let inputWidth = properties[kCGImagePropertyPixelWidth] as? Int,
          let inputHeight = properties[kCGImagePropertyPixelHeight] as? Int,
          inputWidth > 0, inputHeight > 0, inputWidth <= 8192, inputHeight <= 8192,
          inputWidth * inputHeight <= 32_000_000 else {
        throw ImageFailure.message("Das Bild konnte nicht gelesen werden oder ist zu groß (höchstens 32 Megapixel).")
    }
    let handler = VNImageRequestHandler(url: source, options: [:])
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
        throw ImageFailure.message("In diesem Bild wurde kein freistellbares Motiv erkannt.")
    }
    let pixels = try observation.generateMaskedImage(ofInstances: observation.allInstances, from: handler, croppedToInstancesExtent: false)
    let image = CIImage(cvPixelBuffer: pixels)
    let context = CIContext()
    let space = CGColorSpaceCreateDeviceRGB()
    // Verify transparency before publishing, so an opaque white image cannot
    // masquerade as successful background removal.
    let width = Int(image.extent.width), height = Int(image.extent.height)
    guard width > 0, height > 0, width <= 8192, height <= 8192, width * height <= 32_000_000 else {
        throw ImageFailure.message("Das Bild ist für die lokale Freistellung zu groß (höchstens 32 Megapixel).")
    }
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    context.render(image, toBitmap: &rgba, rowBytes: width * 4, bounds: image.extent, format: .RGBA8, colorSpace: space)
    guard stride(from: 3, to: rgba.count, by: 4).contains(where: { rgba[$0] < 255 }) else {
        throw ImageFailure.message("Der Hintergrund ließ sich nicht zuverlässig vom Motiv trennen.")
    }
    try context.writePNGRepresentation(of: image, to: destination, format: .RGBA8, colorSpace: space)
}

do {
    guard CommandLine.arguments.count == 4, CommandLine.arguments[1] == "remove-background" else {
        throw ImageFailure.message("Aufruf: cortex-image-tool remove-background QUELLE ZIEL")
    }
    guard #available(macOS 14.0, *) else {
        throw ImageFailure.message("Lokales Freistellen erfordert macOS 14 oder neuer.")
    }
    try removeBackground(source: URL(fileURLWithPath: CommandLine.arguments[2]), destination: URL(fileURLWithPath: CommandLine.arguments[3]))
} catch {
    FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
    exit(1)
}
