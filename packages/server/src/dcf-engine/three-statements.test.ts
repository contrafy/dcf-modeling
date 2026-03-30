import { describe, it, expect } from "vitest"
import { deriveThreeStatements } from "./three-statements.js"
import type { FinancialModelDrivers } from "@tori/shared"

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 100_000, revenueGrowthRate: 0.10, cogsPercent: 0.40,
    sgaPercent: 0.15, rdPercent: 0.10, daPercent: 0.05,
    interestExpense: 1_000, taxRate: 0.21, cashAndEquivalents: 50_000,
    accountsReceivable: 10_000, inventory: 8_000, ppe: 30_000,
    totalDebt: 20_000, accountsPayable: 7_000, capexPercent: 0.08,
    nwcChange: 2_000, wacc: 0.10, terminalGrowthRate: 0.03,
    projectionYears: 5, sharesOutstanding: 1_000, ...overrides,
  }
}

describe("deriveThreeStatements", () => {
  it("links all three statements together from a single set of drivers", () => {
    const drivers = makeDrivers()
    const result = deriveThreeStatements(drivers)
    expect(result.incomeStatement.revenue).toBe(100_000)
    expect(result.incomeStatement.netIncome).toBeCloseTo(22_910, 0)
    expect(result.balanceSheet.totalAssets).toBe(result.balanceSheet.totalLiabilities + result.balanceSheet.equity)
    expect(result.cashFlowStatement.netIncome).toBe(result.incomeStatement.netIncome)
    expect(result.cashFlowStatement.da).toBe(result.incomeStatement.da)
  })

  it("net income flows from income statement to cash flow statement", () => {
    const drivers = makeDrivers({ revenue: 500_000 })
    const result = deriveThreeStatements(drivers)
    expect(result.cashFlowStatement.netIncome).toBe(result.incomeStatement.netIncome)
  })
})
