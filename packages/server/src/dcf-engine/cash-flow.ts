import type { FinancialModelDrivers, IncomeStatement, CashFlowStatement } from "@dcf-modeling/shared"

function deriveCashFlow(drivers: FinancialModelDrivers, income: IncomeStatement): CashFlowStatement {
  const netIncome = income.netIncome
  const da = income.da
  const nwcChange = drivers.nwcChange
  const operatingCashFlow = netIncome + da - nwcChange
  const capex = drivers.revenue * drivers.capexPercent
  const freeCashFlow = operatingCashFlow - capex
  return { netIncome, da, nwcChange, operatingCashFlow, capex, freeCashFlow }
}

export { deriveCashFlow }
