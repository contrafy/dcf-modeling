import { describe, it, expect, vi } from "vitest"
import { createAdapterOrchestrator } from "./orchestrator.js"
import type { FinancialDataAdapter, RawFinancials, MarketData } from "./adapter-interface.js"

const TEST_TICKER = "AAPL"

function makeRawFinancials(ticker: string): RawFinancials {
  return {
    ticker,
    companyName: "Apple Inc.",
    sector: "Technology",
    country: "US",
    incomeStatements: [],
    balanceSheets: [],
    cashFlows: [],
  }
}

function makeMarketData(ticker: string): MarketData {
  return {
    ticker,
    price: 200.0,
    marketCap: 3_000_000_000_000,
    sharesOutstanding: 15_000_000_000,
    beta: 1.2,
    fiftyTwoWeekHigh: 240.0,
    fiftyTwoWeekLow: 160.0,
    lastUpdated: "2026-01-01T00:00:00.000Z",
  }
}

function makeAdapter(
  name: string,
  available: boolean,
  financials?: RawFinancials,
  marketData?: MarketData,
): FinancialDataAdapter {
  return {
    name,
    isAvailable: vi.fn().mockResolvedValue(available),
    fetchFinancials: vi.fn().mockResolvedValue(financials ?? makeRawFinancials(TEST_TICKER)),
    fetchMarketData: vi.fn().mockResolvedValue(marketData ?? makeMarketData(TEST_TICKER)),
  }
}

describe("adapter orchestrator", () => {
  it("uses the primary adapter when it is available", async () => {
    const primary = makeAdapter("fmp", true)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    await orchestrator.fetchFinancials(TEST_TICKER, 3)

    expect(primary.isAvailable).toHaveBeenCalledOnce()
    expect(primary.fetchFinancials).toHaveBeenCalledWith(TEST_TICKER, 3)
    expect(fallback.fetchFinancials).not.toHaveBeenCalled()
  })

  it("falls back to secondary adapter when primary is unavailable", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const result = await orchestrator.fetchFinancials(TEST_TICKER, 3)

    expect(primary.isAvailable).toHaveBeenCalledOnce()
    expect(primary.fetchFinancials).not.toHaveBeenCalled()
    expect(fallback.fetchFinancials).toHaveBeenCalledWith(TEST_TICKER, 3)
    expect(result.ticker).toBe(TEST_TICKER)
  })

  it("falls back to secondary adapter when primary fetch throws", async () => {
    const primary = makeAdapter("fmp", true)
    vi.spyOn(primary, "fetchFinancials").mockRejectedValueOnce(
      new Error("rate limited"),
    )
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const result = await orchestrator.fetchFinancials(TEST_TICKER, 3)

    expect(fallback.fetchFinancials).toHaveBeenCalledWith(TEST_TICKER, 3)
    expect(result.ticker).toBe(TEST_TICKER)
  })

  it("uses primary adapter for market data when available", async () => {
    const primary = makeAdapter("fmp", true)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    await orchestrator.fetchMarketData(TEST_TICKER)

    expect(primary.fetchMarketData).toHaveBeenCalledWith(TEST_TICKER)
    expect(fallback.fetchMarketData).not.toHaveBeenCalled()
  })

  it("falls back to secondary for market data when primary is unavailable", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const result = await orchestrator.fetchMarketData(TEST_TICKER)

    expect(fallback.fetchMarketData).toHaveBeenCalledWith(TEST_TICKER)
    expect(result.ticker).toBe(TEST_TICKER)
  })

  it("throws when both adapters are unavailable", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", false)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    await expect(orchestrator.fetchFinancials(TEST_TICKER, 3)).rejects.toThrow(
      "No financial data adapter available",
    )
  })

  it("throws when both adapters fail to fetch", async () => {
    const primary = makeAdapter("fmp", true)
    const fallback = makeAdapter("yahoo", true)
    vi.spyOn(primary, "fetchFinancials").mockRejectedValueOnce(new Error("fmp error"))
    vi.spyOn(fallback, "fetchFinancials").mockRejectedValueOnce(new Error("yahoo error"))
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    await expect(orchestrator.fetchFinancials(TEST_TICKER, 3)).rejects.toThrow(
      "No financial data adapter available",
    )
  })

  it("reports available true when at least one adapter is available", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const available = await orchestrator.isAvailable()
    expect(available).toBe(true)
  })

  it("reports available false when no adapter is available", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", false)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const available = await orchestrator.isAvailable()
    expect(available).toBe(false)
  })
})
