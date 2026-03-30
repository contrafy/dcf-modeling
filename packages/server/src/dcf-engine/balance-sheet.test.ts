import { describe, it, expect } from "vitest"
import { deriveBalanceSheet } from "./balance-sheet.js"
import type { FinancialModelDrivers, IncomeStatement } from "@dcf-modeling/shared"

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

describe("deriveBalanceSheet", () => {
  it("computes all balance sheet line items", () => {
    const drivers = makeDrivers()
    const income = makeIncomeStatement()
    const result = deriveBalanceSheet(drivers, income)
    expect(result.cashAndEquivalents).toBe(50_000)
    expect(result.accountsReceivable).toBe(10_000)
    expect(result.inventory).toBe(8_000)
    expect(result.totalCurrentAssets).toBe(68_000)
    expect(result.ppe).toBe(30_000)
    expect(result.totalAssets).toBe(98_000)
    expect(result.accountsPayable).toBe(7_000)
    expect(result.totalDebt).toBe(20_000)
    expect(result.totalLiabilities).toBe(27_000)
    expect(result.equity).toBe(71_000)
  })

  it("balance sheet always balances: assets = liabilities + equity", () => {
    const drivers = makeDrivers({ cashAndEquivalents: 100_000, totalDebt: 5_000 })
    const income = makeIncomeStatement()
    const result = deriveBalanceSheet(drivers, income)
    expect(result.totalAssets).toBe(result.totalLiabilities + result.equity)
  })
})
