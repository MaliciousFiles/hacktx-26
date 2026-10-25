import Foundation
import PDFKit
import Vision
import AppKit

// Local-only OCR. Output is an unreviewed derivative, never an original quote.
guard CommandLine.arguments.count == 4,
      let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])),
      let limit = Int(CommandLine.arguments[3]), limit > 0 else { exit(2) }
var pages: [[String: Any]] = []
for index in 0..<min(document.pageCount, limit) {
    guard let page = document.page(at: index) else { exit(3) }
    let bounds = page.bounds(for: .mediaBox)
    guard bounds.width > 0, bounds.height > 0 else { exit(3) }
    let scale = min(2.5, 2400 / max(bounds.width, bounds.height))
    let width = Int(bounds.width * scale), height = Int(bounds.height * scale)
    guard let ctx = CGContext(data: nil, width: width, height: height,
        bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(3) }
    ctx.setFillColor(NSColor.white.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    guard let image = ctx.makeImage() else { exit(3) }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    try VNImageRequestHandler(cgImage: image).perform([request])
    let lines = (request.results ?? []).compactMap { observation -> [String: Any]? in
        guard let top = observation.topCandidates(1).first else { return nil }
        return ["text": top.string, "confidence": top.confidence]
    }
    pages.append(["page": index + 1, "lines": lines])
}
let result: [String: Any] = ["engine": "apple-vision-v1", "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
    "totalPages": document.pageCount, "pages": pages]
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
try data.write(to: URL(fileURLWithPath: CommandLine.arguments[2]), options: .atomic)
