import type { FinancialModelDrivers, DCFResult } from "@dcf-modeling/shared"
import { deriveThreeStatements } from "./three-statements.js"

function calculateDCF(drivers: FinancialModelDrivers): DCFResult {
  const projectedFCFs: number[] = []
  const discountedFCFs: number[] = []
  const threeStatements = []
  let currentRevenue = drivers.revenue

  for (let year = 1; year <= drivers.projectionYears; year++) {
    const projectedRevenue = currentRevenue * (1 + drivers.revenueGrowthRate)
    const yearDrivers: FinancialModelDrivers = { ...drivers, revenue: projectedRevenue }
    const statements = deriveThreeStatements(yearDrivers)
    const fcf = statements.cashFlowStatement.freeCashFlow
    const discountFactor = (1 + drivers.wacc) ** year
    const discountedFCF = fcf / discountFactor
    projectedFCFs.push(fcf)
    discountedFCFs.push(discountedFCF)
    threeStatements.push(statements)
    currentRevenue = projectedRevenue
  }

  const lastFCF = projectedFCFs[projectedFCFs.length - 1]!
  const terminalValue = (lastFCF * (1 + drivers.terminalGrowthRate)) / (drivers.wacc - drivers.terminalGrowthRate)
  const discountedTerminalValue = terminalValue / (1 + drivers.wacc) ** drivers.projectionYears
  const sumDiscountedFCFs = discountedFCFs.reduce((a, b) => a + b, 0)
  const enterpriseValue = sumDiscountedFCFs + discountedTerminalValue
  const netDebt = drivers.totalDebt - drivers.cashAndEquivalents
  const equityValue = enterpriseValue - netDebt
  const perShareValue = equityValue / drivers.sharesOutstanding

  return {
    projectedFCFs, terminalValue, discountedFCFs, discountedTerminalValue,
    enterpriseValue, netDebt, equityValue, perShareValue, threeStatements,
  }
}

export { calculateDCF }
