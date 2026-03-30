import { describe, it, expect } from "vitest"
import { mergeDrivers } from "./merge-drivers.js"
import type { FinancialModelDrivers } from "@dcf-modeling/shared"

const baseDrivers: FinancialModelDrivers = {
  revenue: 100_000, revenueGrowthRate: 0.10, cogsPercent: 0.40,
  sgaPercent: 0.15, rdPercent: 0.10, daPercent: 0.05,
  interestExpense: 1_000, taxRate: 0.21, cashAndEquivalents: 50_000,
  accountsReceivable: 10_000, inventory: 8_000, ppe: 30_000,
  totalDebt: 20_000, accountsPayable: 7_000, capexPercent: 0.08,
  nwcChange: 2_000, wacc: 0.10, terminalGrowthRate: 0.03,
  projectionYears: 5, sharesOutstanding: 1_000,
}

describe("mergeDrivers", () => {
  it("returns base drivers when no overrides are provided", () => {
    const result = mergeDrivers(baseDrivers, {})
    expect(result).toEqual(baseDrivers)
  })

  it("overrides specific fields while preserving others", () => {
    const result = mergeDrivers(baseDrivers, { revenue: 200_000, taxRate: 0.25 })
    expect(result.revenue).toBe(200_000)
    expect(result.taxRate).toBe(0.25)
    expect(result.cogsPercent).toBe(0.40)
    expect(result.wacc).toBe(0.10)
  })

  it("does not mutate the original drivers", () => {
    const original = { ...baseDrivers }
    mergeDrivers(baseDrivers, { revenue: 999_999 })
    expect(baseDrivers).toEqual(original)
  })

  it("applies multiple override layers in order", () => {
    const apiData: Partial<FinancialModelDrivers> = { revenue: 150_000, cogsPercent: 0.35 }
    const userOverrides: Partial<FinancialModelDrivers> = { revenue: 175_000 }
    const result = mergeDrivers(baseDrivers, apiData, userOverrides)
    expect(result.revenue).toBe(175_000)
    expect(result.cogsPercent).toBe(0.35)
    expect(result.sgaPercent).toBe(0.15)
  })
})
