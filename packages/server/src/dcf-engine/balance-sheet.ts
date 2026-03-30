import type { FinancialModelDrivers, IncomeStatement, BalanceSheet } from "@tori/shared"

function deriveBalanceSheet(drivers: FinancialModelDrivers, _income: IncomeStatement): BalanceSheet {
  const cashAndEquivalents = drivers.cashAndEquivalents
  const accountsReceivable = drivers.accountsReceivable
  const inventory = drivers.inventory
  const totalCurrentAssets = cashAndEquivalents + accountsReceivable + inventory
  const ppe = drivers.ppe
  const totalAssets = totalCurrentAssets + ppe
  const accountsPayable = drivers.accountsPayable
  const totalDebt = drivers.totalDebt
  const totalLiabilities = accountsPayable + totalDebt
  const equity = totalAssets - totalLiabilities
  return { cashAndEquivalents, accountsReceivable, inventory, totalCurrentAssets, ppe, totalAssets, accountsPayable, totalDebt, totalLiabilities, equity }
}

export { deriveBalanceSheet }
