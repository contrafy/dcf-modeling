type RawIncomeStatement = {
  readonly fiscalYear: number
  readonly revenue: number
  readonly cogs: number
  readonly grossProfit: number
  readonly operatingExpenses: number
  readonly ebitda: number
  readonly ebit: number
  readonly interestExpense: number
  readonly netIncome: number
  readonly taxProvision: number
}

type RawBalanceSheet = {
  readonly fiscalYear: number
  readonly cashAndEquivalents: number
  readonly accountsReceivable: number
  readonly inventory: number
  readonly ppe: number
  readonly totalDebt: number
  readonly accountsPayable: number
  readonly totalAssets: number
  readonly totalLiabilities: number
  readonly totalEquity: number
}

type RawCashFlow = {
  readonly fiscalYear: number
  readonly operatingCashFlow: number
  readonly capex: number
  readonly freeCashFlow: number
  readonly da: number
}

type RawFinancials = {
  readonly ticker: string
  readonly companyName: string
  readonly sector: string
  readonly country: string
  readonly incomeStatements: readonly RawIncomeStatement[]
  readonly balanceSheets: readonly RawBalanceSheet[]
  readonly cashFlows: readonly RawCashFlow[]
}

type MarketData = {
  readonly ticker: string
  readonly price: number
  readonly marketCap: number
  readonly sharesOutstanding: number
  readonly beta: number
  readonly fiftyTwoWeekHigh: number
  readonly fiftyTwoWeekLow: number
  readonly lastUpdated: string
}

type FinancialDataAdapter = {
  readonly name: string
  readonly fetchFinancials: (ticker: string, years: number) => Promise<RawFinancials>
  readonly fetchMarketData: (ticker: string) => Promise<MarketData>
  readonly isAvailable: () => Promise<boolean>
}

export type {
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  RawFinancials,
  MarketData,
  FinancialDataAdapter,
}
