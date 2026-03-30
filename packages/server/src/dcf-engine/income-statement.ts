import type { FinancialModelDrivers, IncomeStatement } from "@dcf-modeling/shared"

function deriveIncomeStatement(drivers: FinancialModelDrivers): IncomeStatement {
  const revenue = drivers.revenue
  const cogs = revenue * drivers.cogsPercent
  const grossProfit = revenue - cogs
  const sga = revenue * drivers.sgaPercent
  const rd = revenue * drivers.rdPercent
  const ebitda = grossProfit - sga - rd
  const da = revenue * drivers.daPercent
  const ebit = ebitda - da
  const interestExpense = drivers.interestExpense
  const ebt = ebit - interestExpense
  const tax = ebt * drivers.taxRate
  const netIncome = ebt - tax
  return { revenue, cogs, grossProfit, sga, rd, ebitda, da, ebit, interestExpense, ebt, tax, netIncome }
}

export { deriveIncomeStatement }
