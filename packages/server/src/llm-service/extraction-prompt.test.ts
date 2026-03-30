import { describe, it, expect } from "vitest"
import { buildExtractionPrompt, EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt.js"

describe("EXTRACTION_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof EXTRACTION_SYSTEM_PROMPT).toBe("string")
    expect(EXTRACTION_SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })

  it("instructs the model to return valid JSON", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("JSON")
  })

  it("references the required output fields", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("suppliers")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("customers")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("ticker")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("estimatedRevenueWeight")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("confidence")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("productCategory")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("source")
  })

  it("specifies that estimatedRevenueWeight must be between 0 and 1", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/0(\.\d+)? to 1|0 and 1|0\.0.*1\.0/)
  })

  it("specifies that confidence must be between 0 and 1", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/confidence.*0.*1|0.*1.*confidence/s)
  })
})

describe("buildExtractionPrompt", () => {
  it("includes the company name in the prompt", () => {
    const prompt = buildExtractionPrompt("Apple Inc.", "Some filing text")

    expect(prompt).toContain("Apple Inc.")
  })

  it("includes the filing text in the prompt", () => {
    const filingText = "TSMC is our primary foundry for A-series chips."
    const prompt = buildExtractionPrompt("Apple Inc.", filingText)

    expect(prompt).toContain(filingText)
  })

  it("instructs the model to focus on the specified company", () => {
    const prompt = buildExtractionPrompt("NVIDIA Corporation", "some text")

    expect(prompt).toContain("NVIDIA Corporation")
  })

  it("truncates excessively long filing text to prevent token overflow", () => {
    const longText = "x".repeat(200_000)
    const prompt = buildExtractionPrompt("AAPL", longText)

    expect(prompt.length).toBeLessThan(longText.length + 500)
  })

  it("returns a string", () => {
    const prompt = buildExtractionPrompt("Apple Inc.", "filing text here")

    expect(typeof prompt).toBe("string")
  })
})
