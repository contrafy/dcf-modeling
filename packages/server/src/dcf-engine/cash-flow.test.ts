import { describe, it, expect } from "vitest"
import { deriveCashFlow } from "./cash-flow.js"
import type { FinancialModelDrivers, IncomeStatement } from "@tori/shared"

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

function makeIncomeStatement(overrides: Partial<IncomeStatement> = {}): IncomeStatement {
  return {
    revenue: 100_000, cogs: 40_000, grossProfit: 60_000, sga: 15_000,
    rd: 10_000, ebitda: 35_000, da: 5_000, ebit: 30_000,
    interestExpense: 1_000, ebt: 29_000, tax: 6_090, netIncome: 22_910, ...overrides,
  }
}

describe("deriveCashFlow", () => {
  it("computes free cash flow from net income, D&A, NWC change, and capex", () => {
    const drivers = makeDrivers()
    const income = makeIncomeStatement()
    const result = deriveCashFlow(drivers, income)
    expect(result.netIncome).toBe(22_910)
    expect(result.da).toBe(5_000)
    expect(result.nwcChange).toBe(2_000)
    expect(result.operatingCashFlow).toBe(22_910 + 5_000 - 2_000)
    expect(result.capex).toBe(8_000)
    expect(result.freeCashFlow).toBe(22_910 + 5_000 - 2_000 - 8_000)
  })

  it("negative NWC change increases operating cash flow", () => {
    const drivers = makeDrivers({ nwcChange: -3_000 })
    const income = makeIncomeStatement()
    const result = deriveCashFlow(drivers, income)
    expect(result.operatingCashFlow).toBe(22_910 + 5_000 + 3_000)
  })

  it("high capex reduces free cash flow", () => {
    const drivers = makeDrivers({ capexPercent: 0.30 })
    const income = makeIncomeStatement()
    const result = deriveCashFlow(drivers, income)
    expect(result.capex).toBe(30_000)
    expect(result.freeCashFlow).toBe(22_910 + 5_000 - 2_000 - 30_000)
  })
})
