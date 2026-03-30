import { describe, it, expect } from "vitest"
import { deriveIncomeStatement } from "./income-statement.js"
import type { FinancialModelDrivers } from "@dcf-modeling/shared"

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

describe("deriveIncomeStatement", () => {
  it("computes all line items from revenue through net income", () => {
    const drivers = makeDrivers({ revenue: 100_000 })
    const result = deriveIncomeStatement(drivers)
    expect(result.revenue).toBe(100_000)
    expect(result.cogs).toBe(40_000)
    expect(result.grossProfit).toBe(60_000)
    expect(result.sga).toBe(15_000)
    expect(result.rd).toBe(10_000)
    expect(result.ebitda).toBe(35_000)
    expect(result.da).toBe(5_000)
    expect(result.ebit).toBe(30_000)
    expect(result.interestExpense).toBe(1_000)
    expect(result.ebt).toBe(29_000)
    expect(result.tax).toBeCloseTo(6_090, 2)
    expect(result.netIncome).toBeCloseTo(22_910, 2)
  })

  it("handles zero revenue", () => {
    const drivers = makeDrivers({ revenue: 0 })
    const result = deriveIncomeStatement(drivers)
    expect(result.revenue).toBe(0)
    expect(result.grossProfit).toBe(0)
    expect(result.netIncome).toBeCloseTo(-1_000 * (1 - 0.21), 2)
  })

  it("handles high-margin business", () => {
    const drivers = makeDrivers({ revenue: 200_000, cogsPercent: 0.10, sgaPercent: 0.05, rdPercent: 0.20 })
    const result = deriveIncomeStatement(drivers)
    expect(result.grossProfit).toBe(180_000)
    expect(result.ebitda).toBe(130_000)
  })
})
