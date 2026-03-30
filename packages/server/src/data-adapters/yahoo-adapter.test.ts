import { describe, it, expect, vi } from "vitest"
import { createYahooAdapter } from "./yahoo-adapter.js"

const TEST_TICKER = "AAPL"

const { mockQuoteSummary } = vi.hoisted(() => {
  const mockQuoteSummary = {
    incomeStatementHistory: {
      incomeStatementHistory: [
        {
          endDate: { raw: 1727395200 },
          totalRevenue: { raw: 391_035_000_000 },
          costOfRevenue: { raw: 210_352_000_000 },
          grossProfit: { raw: 180_683_000_000 },
          totalOperatingExpenses: { raw: 267_819_000_000 },
          ebit: { raw: 123_216_000_000 },
          interestExpense: { raw: -3_931_000_000 },
          netIncome: { raw: 93_736_000_000 },
          incomeTaxExpense: { raw: 29_749_000_000 },
        },
      ],
    },
    balanceSheetHistory: {
      balanceSheetStatements: [
        {
          endDate: { raw: 1727395200 },
          cash: { raw: 29_943_000_000 },
          netReceivables: { raw: 68_794_000_000 },
          inventory: { raw: 7_286_000_000 },
          propertyPlantEquipment: { raw: 37_378_000_000 },
          longTermDebt: { raw: 95_281_000_000 },
          shortLongTermDebt: { raw: 6_023_000_000 },
          accountsPayable: { raw: 68_960_000_000 },
          totalAssets: { raw: 364_980_000_000 },
          totalLiab: { raw: 308_030_000_000 },
          totalStockholderEquity: { raw: 56_950_000_000 },
        },
      ],
    },
    cashflowStatementHistory: {
      cashflowStatements: [
        {
          endDate: { raw: 1727395200 },
          totalCashFromOperatingActivities: { raw: 118_254_000_000 },
          capitalExpenditures: { raw: -9_447_000_000 },
          freeCashFlow: { raw: 108_807_000_000 },
          depreciation: { raw: 11_445_000_000 },
        },
      ],
    },
    price: {
      symbol: "AAPL",
      shortName: "Apple Inc.",
      regularMarketPrice: { raw: 213.49 },
      marketCap: { raw: 3_240_000_000_000 },
      sharesOutstanding: { raw: 15_204_137_000 },
      beta: { raw: 1.24 },
      fiftyTwoWeekHigh: { raw: 237.23 },
      fiftyTwoWeekLow: { raw: 164.08 },
    },
    assetProfile: {
      sector: "Technology",
      country: "United States",
    },
  }
  return { mockQuoteSummary }
})

vi.mock("yahoo-finance2", () => ({
  default: {
    quoteSummary: vi.fn().mockResolvedValue(mockQuoteSummary),
  },
}))

describe("Yahoo Finance adapter", () => {
  it("fetches financials by parsing quoteSummary income/balance/cashflow history", async () => {
    const adapter = createYahooAdapter()
    const result = await adapter.fetchFinancials(TEST_TICKER, 1)

    expect(result.ticker).toBe(TEST_TICKER)
    expect(result.companyName).toBe("Apple Inc.")
    expect(result.sector).toBe("Technology")

    expect(result.incomeStatements).toHaveLength(1)
    expect(result.incomeStatements[0]!.revenue).toBe(391_035_000_000)
    expect(result.incomeStatements[0]!.cogs).toBe(210_352_000_000)
    expect(result.incomeStatements[0]!.interestExpense).toBe(3_931_000_000)

    expect(result.balanceSheets).toHaveLength(1)
    expect(result.balanceSheets[0]!.cashAndEquivalents).toBe(29_943_000_000)
    expect(result.balanceSheets[0]!.totalDebt).toBe(101_304_000_000)

    expect(result.cashFlows).toHaveLength(1)
    expect(result.cashFlows[0]!.capex).toBe(9_447_000_000)
    expect(result.cashFlows[0]!.da).toBe(11_445_000_000)
  })

  it("fetches market data from the price module", async () => {
    const adapter = createYahooAdapter()
    const result = await adapter.fetchMarketData(TEST_TICKER)

    expect(result.ticker).toBe(TEST_TICKER)
    expect(result.price).toBe(213.49)
    expect(result.marketCap).toBe(3_240_000_000_000)
    expect(result.sharesOutstanding).toBe(15_204_137_000)
    expect(result.beta).toBe(1.24)
    expect(result.fiftyTwoWeekHigh).toBe(237.23)
    expect(result.fiftyTwoWeekLow).toBe(164.08)
  })

  it("reports isAvailable true when quoteSummary resolves", async () => {
    const adapter = createYahooAdapter()
    const available = await adapter.isAvailable()
    expect(available).toBe(true)
  })

  it("reports isAvailable false when quoteSummary throws", async () => {
    const yahoo = await import("yahoo-finance2")
    vi.spyOn(yahoo.default, "quoteSummary").mockRejectedValueOnce(
      new Error("network error"),
    )

    const adapter = createYahooAdapter()
    const available = await adapter.isAvailable()
    expect(available).toBe(false)
  })
})
