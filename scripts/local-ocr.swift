import Foundation
import Vision
import ImageIO
import PDFKit
import AppKit

// Local-only text recognition. No network client, provider key, or shell input.
func recognize(_ image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let supported = try request.supportedRecognitionLanguages()
    request.recognitionLanguages = ["en-US", "vi-VN"].filter { supported.contains($0) }
    request.automaticallyDetectsLanguage = true
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}
do {
    guard CommandLine.arguments.count == 3 else { throw NSError(domain: "Usage: local-ocr file mime", code: 1) }
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    let mime = CommandLine.arguments[2]
    var pages: [String] = []
    if mime == "application/pdf" {
        guard let pdf = PDFDocument(url: url), !pdf.isLocked, pdf.pageCount > 0, pdf.pageCount <= 10 else {
            throw NSError(domain: "Use an unlocked PDF with 1–10 pages", code: 2)
        }
        for index in 0..<pdf.pageCount {
            guard let page = pdf.page(at: index) else { continue }
            let embedded = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if embedded.count > 20 { pages.append(embedded); continue }
            let thumbnail = page.thumbnail(of: NSSize(width: 1800, height: 2400), for: .mediaBox)
            guard let image = thumbnail.cgImage(forProposedRect: nil, context: nil, hints: nil) else { throw NSError(domain: "PDF page could not be rendered", code: 3) }
            pages.append(try recognize(image))
        }
    } else {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 3000] as CFDictionary) else {
            throw NSError(domain: "Image could not be decoded", code: 4)
        }
        pages.append(try recognize(image))
    }
    let text = pages.enumerated().map { pages.count > 1 ? "Page \($0.offset + 1)\n\($0.element)" : $0.element }.joined(separator: "\n\n")
    guard text.count <= 100000 else { throw NSError(domain: "Recognized text exceeds the review limit", code: 5) }
    let output = try JSONSerialization.data(withJSONObject: ["text": text, "pages": pages.count, "provider": "Apple Vision / PDFKit on this Mac"])
    FileHandle.standardOutput.write(output)
} catch {
    FileHandle.standardError.write(Data("Local reading failed: \(error.localizedDescription)\n".utf8))
    exit(1)
}
