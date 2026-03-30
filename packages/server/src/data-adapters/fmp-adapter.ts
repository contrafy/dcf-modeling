import type {
  FinancialDataAdapter,
  RawFinancials,
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  MarketData,
} from "./adapter-interface.js"

const BASE_URL = "https://financialmodelingprep.com/api/v3"

type FmpConfig = {
  readonly apiKey: string
}

type FmpIncomeRecord = {
  readonly calendarYear: string
  readonly revenue: number
  readonly costOfRevenue: number
  readonly grossProfit: number
  readonly operatingExpenses: number
  readonly ebitda: number
  readonly operatingIncome: number
  readonly interestExpense: number
  readonly netIncome: number
  readonly incomeTaxExpense: number
}

type FmpBalanceRecord = {
  readonly calendarYear: string
  readonly cashAndCashEquivalents: number
  readonly netReceivables: number
  readonly inventory: number
  readonly propertyPlantEquipmentNet: number
  readonly totalDebt: number
  readonly accountPayables: number
  readonly totalAssets: number
  readonly totalLiabilities: number
  readonly totalStockholdersEquity: number
}

type FmpCashFlowRecord = {
  readonly calendarYear: string
  readonly operatingCashFlow: number
  readonly capitalExpenditure: number
  readonly freeCashFlow: number
  readonly depreciationAndAmortization: number
}

type FmpProfile = {
  readonly symbol: string
  readonly companyName: string
  readonly sector: string
  readonly country: string
  readonly price: number
  readonly mktCap: number
  readonly beta: number
}

type FmpSharesFloat = {
  readonly sharesOutstanding: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`FMP request failed: ${response.status} ${url}`)
  }
  return response.json() as Promise<T>
}

function mapIncomeStatement(record: FmpIncomeRecord): RawIncomeStatement {
  return {
    fiscalYear: Number(record.calendarYear),
    revenue: record.revenue,
    cogs: record.costOfRevenue,
    grossProfit: record.grossProfit,
    operatingExpenses: record.operatingExpenses,
    ebitda: record.ebitda,
    ebit: record.operatingIncome,
    interestExpense: record.interestExpense,
    netIncome: record.netIncome,
    taxProvision: record.incomeTaxExpense,
  }
}

function mapBalanceSheet(record: FmpBalanceRecord): RawBalanceSheet {
  return {
    fiscalYear: Number(record.calendarYear),
    cashAndEquivalents: record.cashAndCashEquivalents,
    accountsReceivable: record.netReceivables,
    inventory: record.inventory,
    ppe: record.propertyPlantEquipmentNet,
    totalDebt: record.totalDebt,
    accountsPayable: record.accountPayables,
    totalAssets: record.totalAssets,
    totalLiabilities: record.totalLiabilities,
    totalEquity: record.totalStockholdersEquity,
  }
}

function mapCashFlow(record: FmpCashFlowRecord): RawCashFlow {
  return {
    fiscalYear: Number(record.calendarYear),
    operatingCashFlow: record.operatingCashFlow,
    capex: Math.abs(record.capitalExpenditure),
    freeCashFlow: record.freeCashFlow,
    da: record.depreciationAndAmortization,
  }
}

function createFmpAdapter(config: FmpConfig): FinancialDataAdapter {
  const key = config.apiKey

  async function fetchFinancials(ticker: string, years: number): Promise<RawFinancials> {
    const [incomeRaw, balanceRaw, cashRaw, profileRaw] = await Promise.all([
      fetchJson<FmpIncomeRecord[]>(
        `${BASE_URL}/income-statement/${ticker}?limit=${years}&apikey=${key}`,
      ),
      fetchJson<FmpBalanceRecord[]>(
        `${BASE_URL}/balance-sheet-statement/${ticker}?limit=${years}&apikey=${key}`,
      ),
      fetchJson<FmpCashFlowRecord[]>(
        `${BASE_URL}/cash-flow-statement/${ticker}?limit=${years}&apikey=${key}`,
      ),
      fetchJson<FmpProfile[]>(
        `${BASE_URL}/profile/${ticker}?apikey=${key}`,
      ),
    ])

    const profile = profileRaw[0]
    if (!profile) {
      throw new Error(`FMP: no profile found for ${ticker}`)
    }

    return {
      ticker,
      companyName: profile.companyName,
      sector: profile.sector,
      country: profile.country,
      incomeStatements: incomeRaw.map(mapIncomeStatement),
      balanceSheets: balanceRaw.map(mapBalanceSheet),
      cashFlows: cashRaw.map(mapCashFlow),
    }
  }

  async function fetchMarketData(ticker: string): Promise<MarketData> {
    const [profileRaw, sharesRaw] = await Promise.all([
      fetchJson<FmpProfile[]>(`${BASE_URL}/profile/${ticker}?apikey=${key}`),
      fetchJson<FmpSharesFloat>(`${BASE_URL}/shares_float/${ticker}?apikey=${key}`),
    ])

    const profile = profileRaw[0]
    if (!profile) {
      throw new Error(`FMP: no profile found for ${ticker}`)
    }

    return {
      ticker,
      price: profile.price,
      marketCap: profile.mktCap,
      sharesOutstanding: sharesRaw.sharesOutstanding,
      beta: profile.beta,
      fiftyTwoWeekHigh: 0,
      fiftyTwoWeekLow: 0,
      lastUpdated: new Date().toISOString(),
    }
  }

  async function isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${BASE_URL}/income-statement/AAPL?limit=1&apikey=${key}`)
      return response.ok
    } catch {
      return false
    }
  }

  return {
    name: "fmp",
    fetchFinancials,
    fetchMarketData,
    isAvailable,
  }
}

export { createFmpAdapter }
export type { FmpConfig }
