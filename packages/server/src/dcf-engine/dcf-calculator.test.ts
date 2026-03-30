import { describe, it, expect } from "vitest"
import { calculateDCF } from "./dcf-calculator.js"
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

describe("calculateDCF", () => {
  it("projects FCF for the specified number of years", () => {
    const drivers = makeDrivers({ projectionYears: 5 })
    const result = calculateDCF(drivers)
    expect(result.projectedFCFs).toHaveLength(5)
    expect(result.discountedFCFs).toHaveLength(5)
    expect(result.threeStatements).toHaveLength(5)
  })

  it("grows revenue by revenueGrowthRate each year", () => {
    const drivers = makeDrivers({ revenue: 100_000, revenueGrowthRate: 0.10 })
    const result = calculateDCF(drivers)
    expect(result.threeStatements[0]!.incomeStatement.revenue).toBeCloseTo(110_000, 0)
    expect(result.threeStatements[1]!.incomeStatement.revenue).toBeCloseTo(121_000, 0)
    expect(result.threeStatements[2]!.incomeStatement.revenue).toBeCloseTo(133_100, 0)
  })

  it("discounts FCFs back at WACC", () => {
    const drivers = makeDrivers({ wacc: 0.10 })
    const result = calculateDCF(drivers)
    const firstFCF = result.projectedFCFs[0]!
    const firstDiscounted = result.discountedFCFs[0]!
    expect(firstDiscounted).toBeCloseTo(firstFCF / 1.10, 0)
    const secondFCF = result.projectedFCFs[1]!
    const secondDiscounted = result.discountedFCFs[1]!
    expect(secondDiscounted).toBeCloseTo(secondFCF / (1.10 ** 2), 0)
  })

  it("calculates terminal value using Gordon Growth Model", () => {
    const drivers = makeDrivers({ wacc: 0.10, terminalGrowthRate: 0.03, projectionYears: 5 })
    const result = calculateDCF(drivers)
    const lastFCF = result.projectedFCFs[4]!
    const expectedTV = (lastFCF * (1 + 0.03)) / (0.10 - 0.03)
    expect(result.terminalValue).toBeCloseTo(expectedTV, 0)
  })

  it("computes enterprise value as sum of discounted FCFs + discounted TV", () => {
    const drivers = makeDrivers()
    const result = calculateDCF(drivers)
    const sumDiscountedFCFs = result.discountedFCFs.reduce((a, b) => a + b, 0)
    expect(result.enterpriseValue).toBeCloseTo(sumDiscountedFCFs + result.discountedTerminalValue, 0)
  })

  it("computes equity value as EV minus net debt", () => {
    const drivers = makeDrivers({ totalDebt: 20_000, cashAndEquivalents: 50_000 })
    const result = calculateDCF(drivers)
    expect(result.netDebt).toBe(-30_000)
    expect(result.equityValue).toBeCloseTo(result.enterpriseValue - result.netDebt, 0)
  })

  it("computes per-share value", () => {
    const drivers = makeDrivers({ sharesOutstanding: 1_000 })
    const result = calculateDCF(drivers)
    expect(result.perShareValue).toBeCloseTo(result.equityValue / 1_000, 2)
  })

  it("handles single projection year", () => {
    const drivers = makeDrivers({ projectionYears: 1 })
    const result = calculateDCF(drivers)
    expect(result.projectedFCFs).toHaveLength(1)
    expect(result.enterpriseValue).toBeGreaterThan(0)
  })
})
