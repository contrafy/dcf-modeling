import YahooFinance from "yahoo-finance2"
import type {
  FinancialDataAdapter,
  RawFinancials,
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  MarketData,
} from "./adapter-interface.js"

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] })

function num(val: unknown, fallback = 0): number {
  if (typeof val === "number" && !Number.isNaN(val)) return val
  return fallback
}

function fiscalYearFromDate(val: unknown): number {
  if (val instanceof Date) return val.getFullYear()
  if (typeof val === "string") return new Date(val).getFullYear()
  return new Date().getFullYear()
}

function mapIncomeStatement(r: Record<string, unknown>): RawIncomeStatement {
  return {
    fiscalYear: fiscalYearFromDate(r["date"]),
    revenue: num(r["totalRevenue"]),
    cogs: num(r["costOfRevenue"]),
    grossProfit: num(r["grossProfit"] ?? (num(r["totalRevenue"]) - num(r["costOfRevenue"]))),
    operatingExpenses: num(r["operatingExpense"] ?? r["totalExpenses"]),
    ebitda: num(r["EBITDA"] ?? r["normalizedEBITDA"]),
    ebit: num(r["EBIT"]),
    interestExpense: Math.abs(num(r["interestExpense"])),
    netIncome: num(r["netIncomeCommonStockholders"] ?? r["netIncomeContinuousOperations"]),
    taxProvision: num(r["taxProvision"] ?? r["incomeTaxExpense"]),
  }
}

function mapBalanceSheet(r: Record<string, unknown>): RawBalanceSheet {
  return {
    fiscalYear: fiscalYearFromDate(r["date"]),
    cashAndEquivalents: num(r["cashAndCashEquivalents"] ?? r["cashEquivalents"]),
    accountsReceivable: num(r["accountsReceivable"] ?? r["receivables"]),
    inventory: num(r["inventory"]),
    ppe: num(r["grossPPE"] ?? r["machineryFurnitureEquipment"]),
    totalDebt: num(r["totalDebt"]),
    accountsPayable: num(r["payablesAndAccruedExpenses"] ?? r["currentAccruedExpenses"]),
    totalAssets: num(r["totalAssets"]),
    totalLiabilities: num(r["totalLiabilitiesNetMinorityInterest"]),
    totalEquity: num(r["commonStockEquity"]),
  }
}

function mapCashFlow(r: Record<string, unknown>): RawCashFlow {
  return {
    fiscalYear: fiscalYearFromDate(r["date"]),
    operatingCashFlow: num(r["cashFlowFromContinuingOperatingActivities"]),
    capex: Math.abs(num(r["capitalExpenditure"] ?? r["purchaseOfPPE"])),
    freeCashFlow: num(r["freeCashFlow"]),
    da: num(r["depreciationAndAmortization"] ?? r["depreciationAmortizationDepletion"]),
  }
}

function createYahooAdapter(): FinancialDataAdapter {
  async function fetchFinancials(ticker: string, years: number): Promise<RawFinancials> {
    const threeYearsAgo = new Date()
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - (years + 2))

    const [timeSeries, summary] = await Promise.all([
      yf.fundamentalsTimeSeries(ticker, {
        period1: threeYearsAgo.toISOString().split("T")[0]!,
        period2: new Date().toISOString().split("T")[0]!,
        type: "annual",
        module: "all",
      }) as Promise<Record<string, unknown>[]>,
      yf.quoteSummary(ticker, { modules: ["price", "assetProfile"] }) as Promise<Record<string, unknown>>,
    ])

    const price = summary["price"] as Record<string, unknown> | undefined
    const profile = summary["assetProfile"] as Record<string, unknown> | undefined

    const sorted = timeSeries
      .filter((r) => r["date"] !== undefined)
      .sort((a, b) => {
        const da = new Date(a["date"] as string).getTime()
        const db = new Date(b["date"] as string).getTime()
        return db - da
      })
      .slice(0, years)

    return {
      ticker,
      companyName: String(price?.["shortName"] ?? price?.["longName"] ?? ticker),
      sector: String(profile?.["sector"] ?? "Unknown"),
      country: String(profile?.["country"] ?? "Unknown"),
      incomeStatements: sorted.map(mapIncomeStatement),
      balanceSheets: sorted.map(mapBalanceSheet),
      cashFlows: sorted.map(mapCashFlow),
    }
  }

  async function fetchMarketData(ticker: string): Promise<MarketData> {
    const summary = await yf.quoteSummary(ticker, {
      modules: ["price"],
    }) as Record<string, unknown>

    const price = summary["price"] as Record<string, unknown> | undefined

    const mktPrice = num(price?.["regularMarketPrice"])
    const mktCap = num(price?.["marketCap"])
    const reportedShares = num(price?.["sharesOutstanding"])
    const derivedShares = mktPrice > 0 ? Math.round(mktCap / mktPrice) : 0

    return {
      ticker,
      price: mktPrice,
      marketCap: mktCap,
      sharesOutstanding: reportedShares > 0 ? reportedShares : derivedShares,
      beta: num(price?.["beta"]),
      fiftyTwoWeekHigh: num(price?.["fiftyTwoWeekHigh"]),
      fiftyTwoWeekLow: num(price?.["fiftyTwoWeekLow"]),
      lastUpdated: new Date().toISOString(),
    }
  }

  async function isAvailable(): Promise<boolean> {
    try {
      await yf.quoteSummary("AAPL", { modules: ["price"] })
      return true
    } catch {
      return false
    }
  }

  return {
    name: "yahoo",
    fetchFinancials,
    fetchMarketData,
    isAvailable,
  }
}

export { createYahooAdapter }
