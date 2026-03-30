import yahooFinance from "yahoo-finance2"
import type {
  FinancialDataAdapter,
  RawFinancials,
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  MarketData,
} from "./adapter-interface.js"

type WithRaw<T> = { raw: T }

type YahooIncomeStatement = {
  readonly endDate: WithRaw<number>
  readonly totalRevenue?: WithRaw<number>
  readonly costOfRevenue?: WithRaw<number>
  readonly grossProfit?: WithRaw<number>
  readonly totalOperatingExpenses?: WithRaw<number>
  readonly ebit?: WithRaw<number>
  readonly interestExpense?: WithRaw<number>
  readonly netIncome?: WithRaw<number>
  readonly incomeTaxExpense?: WithRaw<number>
}

type YahooBalanceSheet = {
  readonly endDate: WithRaw<number>
  readonly cash?: WithRaw<number>
  readonly netReceivables?: WithRaw<number>
  readonly inventory?: WithRaw<number>
  readonly propertyPlantEquipment?: WithRaw<number>
  readonly longTermDebt?: WithRaw<number>
  readonly shortLongTermDebt?: WithRaw<number>
  readonly accountsPayable?: WithRaw<number>
  readonly totalAssets?: WithRaw<number>
  readonly totalLiab?: WithRaw<number>
  readonly totalStockholderEquity?: WithRaw<number>
}

type YahooCashFlow = {
  readonly endDate: WithRaw<number>
  readonly totalCashFromOperatingActivities?: WithRaw<number>
  readonly capitalExpenditures?: WithRaw<number>
  readonly freeCashFlow?: WithRaw<number>
  readonly depreciation?: WithRaw<number>
}

type YahooQuoteSummary = {
  readonly incomeStatementHistory?: {
    readonly incomeStatementHistory: readonly YahooIncomeStatement[]
  }
  readonly balanceSheetHistory?: {
    readonly balanceSheetStatements: readonly YahooBalanceSheet[]
  }
  readonly cashflowStatementHistory?: {
    readonly cashflowStatements: readonly YahooCashFlow[]
  }
  readonly price?: {
    readonly symbol: string
    readonly shortName?: string
    readonly regularMarketPrice?: WithRaw<number>
    readonly marketCap?: WithRaw<number>
    readonly sharesOutstanding?: WithRaw<number>
    readonly beta?: WithRaw<number>
    readonly fiftyTwoWeekHigh?: WithRaw<number>
    readonly fiftyTwoWeekLow?: WithRaw<number>
  }
  readonly assetProfile?: {
    readonly sector?: string
    readonly country?: string
  }
}

function rawVal(field: WithRaw<number> | undefined, fallback = 0): number {
  return field?.raw ?? fallback
}

function fiscalYearFromTimestamp(ts: number): number {
  return new Date(ts * 1000).getFullYear()
}

function mapIncomeStatement(record: YahooIncomeStatement): RawIncomeStatement {
  return {
    fiscalYear: fiscalYearFromTimestamp(record.endDate.raw),
    revenue: rawVal(record.totalRevenue),
    cogs: rawVal(record.costOfRevenue),
    grossProfit: rawVal(record.grossProfit),
    operatingExpenses: rawVal(record.totalOperatingExpenses),
    ebitda: rawVal(record.ebit),
    ebit: rawVal(record.ebit),
    interestExpense: Math.abs(rawVal(record.interestExpense)),
    netIncome: rawVal(record.netIncome),
    taxProvision: rawVal(record.incomeTaxExpense),
  }
}

function mapBalanceSheet(record: YahooBalanceSheet): RawBalanceSheet {
  const longTermDebt = rawVal(record.longTermDebt)
  const shortTermDebt = rawVal(record.shortLongTermDebt)
  return {
    fiscalYear: fiscalYearFromTimestamp(record.endDate.raw),
    cashAndEquivalents: rawVal(record.cash),
    accountsReceivable: rawVal(record.netReceivables),
    inventory: rawVal(record.inventory),
    ppe: rawVal(record.propertyPlantEquipment),
    totalDebt: longTermDebt + shortTermDebt,
    accountsPayable: rawVal(record.accountsPayable),
    totalAssets: rawVal(record.totalAssets),
    totalLiabilities: rawVal(record.totalLiab),
    totalEquity: rawVal(record.totalStockholderEquity),
  }
}

function mapCashFlow(record: YahooCashFlow): RawCashFlow {
  return {
    fiscalYear: fiscalYearFromTimestamp(record.endDate.raw),
    operatingCashFlow: rawVal(record.totalCashFromOperatingActivities),
    capex: Math.abs(rawVal(record.capitalExpenditures)),
    freeCashFlow: rawVal(record.freeCashFlow),
    da: rawVal(record.depreciation),
  }
}

function createYahooAdapter(): FinancialDataAdapter {
  async function fetchFinancials(ticker: string, years: number): Promise<RawFinancials> {
    const summary = (await yahooFinance.quoteSummary(ticker, {
      modules: [
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
        "price",
        "assetProfile",
      ],
    })) as YahooQuoteSummary

    const incomeRaw = summary.incomeStatementHistory?.incomeStatementHistory ?? []
    const balanceRaw = summary.balanceSheetHistory?.balanceSheetStatements ?? []
    const cashRaw = summary.cashflowStatementHistory?.cashflowStatements ?? []

    return {
      ticker,
      companyName: summary.price?.shortName ?? ticker,
      sector: summary.assetProfile?.sector ?? "Unknown",
      country: summary.assetProfile?.country ?? "Unknown",
      incomeStatements: incomeRaw.slice(0, years).map(mapIncomeStatement),
      balanceSheets: balanceRaw.slice(0, years).map(mapBalanceSheet),
      cashFlows: cashRaw.slice(0, years).map(mapCashFlow),
    }
  }

  async function fetchMarketData(ticker: string): Promise<MarketData> {
    const summary = (await yahooFinance.quoteSummary(ticker, {
      modules: ["price"],
    })) as YahooQuoteSummary

    const price = summary.price

    return {
      ticker,
      price: rawVal(price?.regularMarketPrice),
      marketCap: rawVal(price?.marketCap),
      sharesOutstanding: rawVal(price?.sharesOutstanding),
      beta: rawVal(price?.beta),
      fiftyTwoWeekHigh: rawVal(price?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: rawVal(price?.fiftyTwoWeekLow),
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
