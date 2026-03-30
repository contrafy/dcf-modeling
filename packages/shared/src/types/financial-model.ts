type IncomeStatementDrivers = {
  readonly revenue: number
  readonly revenueGrowthRate: number
  readonly cogsPercent: number
  readonly sgaPercent: number
  readonly rdPercent: number
  readonly daPercent: number
  readonly interestExpense: number
  readonly taxRate: number
}

type BalanceSheetDrivers = {
  readonly cashAndEquivalents: number
  readonly accountsReceivable: number
  readonly inventory: number
  readonly ppe: number
  readonly totalDebt: number
  readonly accountsPayable: number
}

type CashFlowDrivers = {
  readonly capexPercent: number
  readonly nwcChange: number
}

type DCFParameters = {
  readonly wacc: number
  readonly terminalGrowthRate: number
  readonly projectionYears: number
  readonly sharesOutstanding: number
}

type FinancialModelDrivers = IncomeStatementDrivers &
  BalanceSheetDrivers &
  CashFlowDrivers &
  DCFParameters

type FinancialModel = {
  readonly companyTicker: string
  readonly fiscalYear: number
  readonly drivers: FinancialModelDrivers
  readonly overrides: Partial<FinancialModelDrivers>
}

type IncomeStatement = {
  readonly revenue: number
  readonly cogs: number
  readonly grossProfit: number
  readonly sga: number
  readonly rd: number
  readonly ebitda: number
  readonly da: number
  readonly ebit: number
  readonly interestExpense: number
  readonly ebt: number
  readonly tax: number
  readonly netIncome: number
}

type BalanceSheet = {
  readonly cashAndEquivalents: number
  readonly accountsReceivable: number
  readonly inventory: number
  readonly totalCurrentAssets: number
  readonly ppe: number
  readonly totalAssets: number
  readonly accountsPayable: number
  readonly totalDebt: number
  readonly totalLiabilities: number
  readonly equity: number
}

type CashFlowStatement = {
  readonly netIncome: number
  readonly da: number
  readonly nwcChange: number
  readonly operatingCashFlow: number
  readonly capex: number
  readonly freeCashFlow: number
}

type ThreeStatementOutput = {
  readonly incomeStatement: IncomeStatement
  readonly balanceSheet: BalanceSheet
  readonly cashFlowStatement: CashFlowStatement
}

export type {
  IncomeStatementDrivers,
  BalanceSheetDrivers,
  CashFlowDrivers,
  DCFParameters,
  FinancialModelDrivers,
  FinancialModel,
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  ThreeStatementOutput,
}
