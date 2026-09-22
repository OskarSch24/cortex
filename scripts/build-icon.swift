import AppKit
import Foundation

// Package the selected faceted-brain artwork for macOS and the Cortex UI.
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let brand = root.appendingPathComponent("brand")
let source = brand.appendingPathComponent("selected/cortex-facetten.png")
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
    let canvas = NSRect(x: 0, y: 0, width: size, height: size)
    NSColor.clear.setFill()
    canvas.fill()
    let scale = CGFloat(size) / 1024
    let tile = NSRect(x: 100 * scale, y: 100 * scale, width: 824 * scale, height: 824 * scale)
    let shape = NSBezierPath(roundedRect: tile, xRadius: 184 * scale, yRadius: 184 * scale)
    shape.addClip()
    NSColor.black.setFill()
    shape.fill()
    // This master is a full-bleed composition without macOS tile margins.
    // Drawing into the squircle keeps the brain inside the rounded mask.
    artwork.draw(in: tile, from: .zero, operation: .sourceOver, fraction: 1)
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

// Der Startbildschirm bringt seinen eigenen Hintergrund mit; dort steht das
// Gehirn ohne die schwarze Kachel, quadratisch zentriert auf klarem Grund.
func renderBare(size: Int, to output: URL) throws {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
        isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Cannot create brain bitmap")
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    NSColor.clear.setFill()
    NSRect(x: 0, y: 0, width: size, height: size).fill()
    artwork.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .sourceOver, fraction: 1)
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Cannot encode brain bitmap")
    }
    try data.write(to: output)
}
try renderBare(size: 256, to: root.appendingPathComponent("engine/packages/vscode/webview/assets/cortex-brain.png"))
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", brand.appendingPathComponent("Code.icns").path]
try process.run()
process.waitUntilExit()
guard process.terminationStatus == 0 else { fatalError("iconutil failed") }
print("Built \(brand.appendingPathComponent("Code.icns").path)")
