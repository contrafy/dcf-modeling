import { describe, it, expect } from "vitest"
import { parseExtractionResponse } from "./response-parser.js"
import type { ExtractionResult } from "./response-parser.js"

function makeValidResponse(overrides: Record<string, unknown> = {}): string {
  const base = {
    company: "Apple Inc.",
    suppliers: [
      {
        name: "Taiwan Semiconductor Manufacturing",
        ticker: "TSM",
        relationship: "Primary foundry for A-series and M-series chips",
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
        relationship: "Retail reseller of Apple hardware",
        productCategory: "Consumer Electronics Retail",
        estimatedRevenueWeight: 0.05,
        confidence: 0.75,
        source: "10-K FY2025, page 18",
      },
    ],
    ...overrides,
  }
  return JSON.stringify(base)
}

describe("parseExtractionResponse", () => {
  it("parses a valid JSON response into an ExtractionResult", () => {
    const result = parseExtractionResponse(makeValidResponse())

    expect(result.company).toBe("Apple Inc.")
    expect(result.suppliers).toHaveLength(1)
    expect(result.customers).toHaveLength(1)
  })

  it("returns the correct supplier fields", () => {
    const result = parseExtractionResponse(makeValidResponse())
    const supplier = result.suppliers[0]!

    expect(supplier.name).toBe("Taiwan Semiconductor Manufacturing")
    expect(supplier.ticker).toBe("TSM")
    expect(supplier.relationship).toBe("Primary foundry for A-series and M-series chips")
    expect(supplier.productCategory).toBe("Advanced Logic Chips")
    expect(supplier.estimatedRevenueWeight).toBe(0.25)
    expect(supplier.confidence).toBe(0.92)
    expect(supplier.source).toBe("10-K FY2025, page 12")
  })

  it("returns the correct customer fields", () => {
    const result = parseExtractionResponse(makeValidResponse())
    const customer = result.customers[0]!

    expect(customer.name).toBe("Best Buy Co.")
    expect(customer.ticker).toBe("BBY")
    expect(customer.estimatedRevenueWeight).toBe(0.05)
    expect(customer.confidence).toBe(0.75)
  })

  it("handles empty suppliers and customers arrays", () => {
    const response = makeValidResponse({ suppliers: [], customers: [] })
    const result = parseExtractionResponse(response)

    expect(result.suppliers).toHaveLength(0)
    expect(result.customers).toHaveLength(0)
  })

  it("throws a descriptive error for malformed JSON", () => {
    expect(() => parseExtractionResponse("not json at all")).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when the response is valid JSON but not an object", () => {
    expect(() => parseExtractionResponse('"just a string"')).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when the company field is missing", () => {
    const broken = JSON.stringify({ suppliers: [], customers: [] })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when suppliers field is missing", () => {
    const broken = JSON.stringify({ company: "AAPL", customers: [] })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when customers field is missing", () => {
    const broken = JSON.stringify({ company: "AAPL", suppliers: [] })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when a supplier is missing required fields", () => {
    const broken = makeValidResponse({
      suppliers: [{ name: "TSMC" }],
    })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when estimatedRevenueWeight is out of range", () => {
    const broken = makeValidResponse({
      suppliers: [
        {
          name: "TSMC",
          ticker: "TSM",
          relationship: "foundry",
          productCategory: "chips",
          estimatedRevenueWeight: 1.5,
          confidence: 0.9,
          source: "page 1",
        },
      ],
    })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when confidence is out of range", () => {
    const broken = makeValidResponse({
      customers: [
        {
          name: "Best Buy",
          ticker: "BBY",
          relationship: "retail",
          productCategory: "electronics",
          estimatedRevenueWeight: 0.05,
          confidence: -0.1,
          source: "page 5",
        },
      ],
    })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("strips markdown code fences before parsing", () => {
    const json = makeValidResponse()
    const fenced = `\`\`\`json\n${json}\n\`\`\``
    const result = parseExtractionResponse(fenced)

    expect(result.company).toBe("Apple Inc.")
  })

  it("handles code fences without language tag", () => {
    const json = makeValidResponse()
    const fenced = `\`\`\`\n${json}\n\`\`\``
    const result = parseExtractionResponse(fenced)

    expect(result.company).toBe("Apple Inc.")
  })
})
