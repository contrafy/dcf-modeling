import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { createFmpAdapter } from "./fmp-adapter.js"

const FMP_BASE = "https://financialmodelingprep.com/api/v3"
const TEST_API_KEY = "test-key-123"
const TEST_TICKER = "AAPL"

const mockIncomeStatements = [
  {
    date: "2025-09-27",
    calendarYear: "2025",
    revenue: 391_035_000_000,
    costOfRevenue: 210_352_000_000,
    grossProfit: 180_683_000_000,
    operatingExpenses: 57_467_000_000,
    ebitda: 134_661_000_000,
    operatingIncome: 123_216_000_000,
    interestExpense: 3_931_000_000,
    netIncome: 93_736_000_000,
    incomeTaxExpense: 29_749_000_000,
  },
  {
    date: "2024-09-28",
    calendarYear: "2024",
    revenue: 383_285_000_000,
    costOfRevenue: 210_352_000_000,
    grossProfit: 172_933_000_000,
    operatingExpenses: 54_847_000_000,
    ebitda: 129_626_000_000,
    operatingIncome: 118_086_000_000,
    interestExpense: 3_841_000_000,
    netIncome: 93_736_000_000,
    incomeTaxExpense: 24_350_000_000,
  },
]

const mockBalanceSheets = [
  {
    date: "2025-09-27",
    calendarYear: "2025",
    cashAndCashEquivalents: 29_943_000_000,
    netReceivables: 68_794_000_000,
    inventory: 7_286_000_000,
    propertyPlantEquipmentNet: 37_378_000_000,
    totalDebt: 101_304_000_000,
    accountPayables: 68_960_000_000,
    totalAssets: 364_980_000_000,
    totalLiabilities: 308_030_000_000,
    totalStockholdersEquity: 56_950_000_000,
  },
]

const mockCashFlows = [
  {
    date: "2025-09-27",
    calendarYear: "2025",
    operatingCashFlow: 118_254_000_000,
    capitalExpenditure: -9_447_000_000,
    freeCashFlow: 108_807_000_000,
    depreciationAndAmortization: 11_445_000_000,
  },
]

const mockProfile = [
  {
    symbol: TEST_TICKER,
    companyName: "Apple Inc.",
    sector: "Technology",
    country: "US",
    price: 213.49,
    mktCap: 3_240_000_000_000,
    volAvg: 50_000_000,
    beta: 1.24,
  },
]

const mockSharesOutstanding = {
  symbol: TEST_TICKER,
  sharesOutstanding: 15_204_137_000,
}

const server = setupServer(
  http.get(`${FMP_BASE}/income-statement/${TEST_TICKER}`, ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get("apikey") !== TEST_API_KEY) {
      return HttpResponse.json({ error: "Invalid API key" }, { status: 401 })
    }
    return HttpResponse.json(mockIncomeStatements)
  }),
  http.get(`${FMP_BASE}/balance-sheet-statement/${TEST_TICKER}`, () =>
    HttpResponse.json(mockBalanceSheets),
  ),
  http.get(`${FMP_BASE}/cash-flow-statement/${TEST_TICKER}`, () =>
    HttpResponse.json(mockCashFlows),
  ),
  http.get(`${FMP_BASE}/profile/${TEST_TICKER}`, () =>
    HttpResponse.json(mockProfile),
  ),
  http.get(`${FMP_BASE}/shares_float/${TEST_TICKER}`, () =>
    HttpResponse.json(mockSharesOutstanding),
  ),
)

describe("FMP adapter", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterAll(() => server.close())

  it("fetches income statements, balance sheets, and cash flows for a ticker", async () => {
    const adapter = createFmpAdapter({ apiKey: TEST_API_KEY })
    const result = await adapter.fetchFinancials(TEST_TICKER, 2)

    expect(result.ticker).toBe(TEST_TICKER)
    expect(result.companyName).toBe("Apple Inc.")
    expect(result.sector).toBe("Technology")
    expect(result.country).toBe("US")

    expect(result.incomeStatements).toHaveLength(2)
    expect(result.incomeStatements[0]!.fiscalYear).toBe(2025)
    expect(result.incomeStatements[0]!.revenue).toBe(391_035_000_000)
    expect(result.incomeStatements[0]!.cogs).toBe(210_352_000_000)

    expect(result.balanceSheets).toHaveLength(1)
    expect(result.balanceSheets[0]!.cashAndEquivalents).toBe(29_943_000_000)
    expect(result.balanceSheets[0]!.totalDebt).toBe(101_304_000_000)

    expect(result.cashFlows).toHaveLength(1)
    expect(result.cashFlows[0]!.freeCashFlow).toBe(108_807_000_000)
    expect(result.cashFlows[0]!.da).toBe(11_445_000_000)
  })

  it("fetches market data for a ticker", async () => {
    const adapter = createFmpAdapter({ apiKey: TEST_API_KEY })
    const result = await adapter.fetchMarketData(TEST_TICKER)

    expect(result.ticker).toBe(TEST_TICKER)
    expect(result.price).toBe(213.49)
    expect(result.marketCap).toBe(3_240_000_000_000)
    expect(result.sharesOutstanding).toBe(15_204_137_000)
    expect(result.beta).toBe(1.24)
    expect(result.lastUpdated).toBeDefined()
  })

  it("returns isAvailable true when profile endpoint responds", async () => {
    const adapter = createFmpAdapter({ apiKey: TEST_API_KEY })
    const available = await adapter.isAvailable()
    expect(available).toBe(true)
  })

  it("returns isAvailable false when API key is invalid (401 response)", async () => {
    const adapter = createFmpAdapter({ apiKey: "wrong-key" })
    const available = await adapter.isAvailable()
    expect(available).toBe(false)
  })
})
