import yahooFinance from "yahoo-finance2"
import type {
  FinancialDataAdapter,
  RawFinancials,
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  MarketData,
} from "./adapter-interface.js"

function num(val: unknown, fallback = 0): number {
  if (typeof val === "number" && !Number.isNaN(val)) return val
  if (val && typeof val === "object" && "raw" in val) return num((val as { raw: unknown }).raw, fallback)
  return fallback
}

function fiscalYearFromDate(val: unknown): number {
  if (val instanceof Date) return val.getFullYear()
  if (typeof val === "number") return new Date(val * 1000).getFullYear()
  if (typeof val === "string") return new Date(val).getFullYear()
  return new Date().getFullYear()
}

function mapIncomeStatement(record: Record<string, unknown>): RawIncomeStatement {
  return {
    fiscalYear: fiscalYearFromDate(record["endDate"]),
    revenue: num(record["totalRevenue"]),
    cogs: num(record["costOfRevenue"]),
    grossProfit: num(record["grossProfit"]),
    operatingExpenses: num(record["totalOperatingExpenses"]),
    ebitda: num(record["ebitda"] ?? record["ebit"]),
    ebit: num(record["ebit"]),
    interestExpense: Math.abs(num(record["interestExpense"])),
    netIncome: num(record["netIncome"]),
    taxProvision: num(record["incomeTaxExpense"]),
  }
}

function mapBalanceSheet(record: Record<string, unknown>): RawBalanceSheet {
  const longTermDebt = num(record["longTermDebt"])
  const shortTermDebt = num(record["shortLongTermDebt"])
  return {
    fiscalYear: fiscalYearFromDate(record["endDate"]),
    cashAndEquivalents: num(record["cash"] ?? record["cashAndCashEquivalents"]),
    accountsReceivable: num(record["netReceivables"]),
    inventory: num(record["inventory"]),
    ppe: num(record["propertyPlantEquipment"]),
    totalDebt: longTermDebt + shortTermDebt,
    accountsPayable: num(record["accountsPayable"]),
    totalAssets: num(record["totalAssets"]),
    totalLiabilities: num(record["totalLiab"] ?? record["totalLiabilities"]),
    totalEquity: num(record["totalStockholderEquity"] ?? record["totalShareholderEquity"]),
  }
}

function mapCashFlow(record: Record<string, unknown>): RawCashFlow {
  return {
    fiscalYear: fiscalYearFromDate(record["endDate"]),
    operatingCashFlow: num(record["totalCashFromOperatingActivities"] ?? record["operatingCashflow"]),
    capex: Math.abs(num(record["capitalExpenditures"])),
    freeCashFlow: num(record["freeCashFlow"]),
    da: num(record["depreciation"] ?? record["depreciationAndAmortization"]),
  }
}

function createYahooAdapter(): FinancialDataAdapter {
  async function fetchFinancials(ticker: string, years: number): Promise<RawFinancials> {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
        "price",
        "assetProfile",
      ],
    }) as Record<string, unknown>

    const incomeHistory = summary["incomeStatementHistory"] as Record<string, unknown> | undefined
    const balanceHistory = summary["balanceSheetHistory"] as Record<string, unknown> | undefined
    const cashHistory = summary["cashflowStatementHistory"] as Record<string, unknown> | undefined
    const price = summary["price"] as Record<string, unknown> | undefined
    const profile = summary["assetProfile"] as Record<string, unknown> | undefined

    const incomeRaw = (incomeHistory?.["incomeStatementHistory"] ?? []) as Record<string, unknown>[]
    const balanceRaw = (balanceHistory?.["balanceSheetStatements"] ?? []) as Record<string, unknown>[]
    const cashRaw = (cashHistory?.["cashflowStatements"] ?? []) as Record<string, unknown>[]

    return {
      ticker,
      companyName: String(price?.["shortName"] ?? price?.["longName"] ?? ticker),
      sector: String(profile?.["sector"] ?? "Unknown"),
      country: String(profile?.["country"] ?? "Unknown"),
      incomeStatements: incomeRaw.slice(0, years).map(mapIncomeStatement),
      balanceSheets: balanceRaw.slice(0, years).map(mapBalanceSheet),
      cashFlows: cashRaw.slice(0, years).map(mapCashFlow),
    }
  }

  async function fetchMarketData(ticker: string): Promise<MarketData> {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["price"],
    }) as Record<string, unknown>

    const price = summary["price"] as Record<string, unknown> | undefined

    return {
      ticker,
      price: num(price?.["regularMarketPrice"]),
      marketCap: num(price?.["marketCap"]),
      sharesOutstanding: num(price?.["sharesOutstanding"]),
      beta: num(price?.["beta"]),
      fiftyTwoWeekHigh: num(price?.["fiftyTwoWeekHigh"]),
      fiftyTwoWeekLow: num(price?.["fiftyTwoWeekLow"]),
      lastUpdated: new Date().toISOString(),
    }
  }

  async function isAvailable(): Promise<boolean> {
    try {
      await yahooFinance.quoteSummary("AAPL", { modules: ["price"] })
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
