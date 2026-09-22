import AppKit
import Foundation

// Package the brighter approved artwork for both macOS and the Cortex UI.
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let brand = root.appendingPathComponent("brand")
let source = brand.appendingPathComponent("selected/cortex-gehirn-hell.png")
guard let artwork = NSImage(contentsOf: source) else {
    fatalError("Cannot read selected artwork: \(source.path)")
}
let iconset = brand.appendingPathComponent("icon.iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

func render(size: Int, to output: URL) throws {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
        isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Cannot create icon bitmap")
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    let scale = CGFloat(size) / 1024
    let tile = NSRect(x: 100 * scale, y: 100 * scale, width: 824 * scale, height: 824 * scale)
    let shape = NSBezierPath(roundedRect: tile, xRadius: 184 * scale, yRadius: 184 * scale)
    shape.addClip()
    NSColor.black.setFill()
    shape.fill()
    // This master already includes the icon's canvas margins. Clip the black
    // background to the macOS tile without adding a second inset to the brain.
    artwork.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .sourceOver, fraction: 1)
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Cannot encode icon bitmap")
    }
    try data.write(to: output)
}

try render(size: 1024, to: brand.appendingPathComponent("icon.png"))
for size in [16, 32, 128, 256, 512] {
    try render(size: size, to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
    try render(size: size * 2, to: iconset.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
// Keep the project's existing explicit 64 and 1024 pixel assets in sync too.
for size in [64, 1024] {
    try render(size: size, to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
}
let webviewIcon = root.appendingPathComponent("engine/packages/vscode/webview/assets/cortex-icon.png")
try Data(contentsOf: iconset.appendingPathComponent("icon_256x256.png")).write(to: webviewIcon)
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", brand.appendingPathComponent("Code.icns").path]
try process.run()
process.waitUntilExit()
guard process.terminationStatus == 0 else { fatalError("iconutil failed") }
print("Built \(brand.appendingPathComponent("Code.icns").path)")
