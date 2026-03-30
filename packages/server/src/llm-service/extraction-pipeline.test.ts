import { describe, it, expect, vi } from "vitest"
import { createExtractionPipeline } from "./extraction-pipeline.js"
import type { ExtractionResult } from "./response-parser.js"

function makeFilingFetcher(text: string) {
  return vi.fn().mockResolvedValue(text)
}

function makeGroqClient(responseJson: string) {
  return {
    model: "llama-3.3-70b-versatile",
    complete: vi.fn().mockResolvedValue(responseJson),
    _groq: {} as never,
  }
}

function makeValidLlmResponse(company = "Apple Inc."): string {
  return JSON.stringify({
    company,
    suppliers: [
      {
        name: "Taiwan Semiconductor Manufacturing",
        ticker: "TSM",
        relationship: "Primary foundry for A-series chips",
        productCategory: "Advanced Logic Chips",
        estimatedRevenueWeight: 0.25,
        confidence: 0.92,
        source: "10-K FY2025, page 12",
      },
    ],
    customers: [
      {
        name: "Best Buy Co.",
        ticker: "BBY",
        relationship: "Retail reseller",
        productCategory: "Consumer Electronics Retail",
        estimatedRevenueWeight: 0.05,
        confidence: 0.75,
        source: "10-K FY2025, page 18",
      },
    ],
  })
}

describe("createExtractionPipeline", () => {
  it("returns an ExtractionResult for a valid company ticker", async () => {
    const fetcher = makeFilingFetcher("Apple 10-K filing text here.")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    const result = await pipeline.extract("AAPL")

    expect(result.company).toBe("Apple Inc.")
    expect(result.suppliers).toHaveLength(1)
    expect(result.customers).toHaveLength(1)
  })

  it("calls the filing fetcher with the provided ticker", async () => {
    const fetcher = makeFilingFetcher("filing text")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await pipeline.extract("NVDA")

    expect(fetcher).toHaveBeenCalledWith("NVDA")
  })

  it("passes the filing text to the LLM client", async () => {
    const filingText = "TSMC is our primary manufacturer."
    const fetcher = makeFilingFetcher(filingText)
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await pipeline.extract("AAPL")

    const [, userMessage] = llmClient.complete.mock.calls[0] as [string, string]
    expect(userMessage).toContain(filingText)
  })

  it("passes the extraction system prompt as the system message", async () => {
    const fetcher = makeFilingFetcher("some filing text")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await pipeline.extract("AAPL")

    const [systemPrompt] = llmClient.complete.mock.calls[0] as [string, string]
    expect(systemPrompt).toContain("JSON")
    expect(systemPrompt).toContain("suppliers")
    expect(systemPrompt).toContain("customers")
  })

  it("includes the ticker in the user message sent to the LLM", async () => {
    const fetcher = makeFilingFetcher("some filing text")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await pipeline.extract("TSMC")

    const [, userMessage] = llmClient.complete.mock.calls[0] as [string, string]
    expect(userMessage).toContain("TSMC")
  })

  it("propagates filing fetch errors", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("SEC EDGAR rate limit"))
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await expect(pipeline.extract("AAPL")).rejects.toThrow("SEC EDGAR rate limit")
  })

  it("propagates LLM client errors", async () => {
    const fetcher = makeFilingFetcher("filing text")
    const llmClient = {
      model: "llama-3.3-70b-versatile",
      complete: vi.fn().mockRejectedValue(new Error("Groq API error")),
      _groq: {} as never,
    }
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await expect(pipeline.extract("AAPL")).rejects.toThrow("Groq API error")
  })

  it("propagates response parsing errors", async () => {
    const fetcher = makeFilingFetcher("filing text")
    const llmClient = makeGroqClient("this is not json")
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await expect(pipeline.extract("AAPL")).rejects.toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("returns suppliers with all required fields intact", async () => {
    const fetcher = makeFilingFetcher("filing text")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    const result: ExtractionResult = await pipeline.extract("AAPL")
    const supplier = result.suppliers[0]!

    expect(supplier.name).toBe("Taiwan Semiconductor Manufacturing")
    expect(supplier.ticker).toBe("TSM")
    expect(supplier.estimatedRevenueWeight).toBe(0.25)
    expect(supplier.confidence).toBe(0.92)
  })
})
