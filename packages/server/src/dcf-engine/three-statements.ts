import type { FinancialModelDrivers, ThreeStatementOutput } from "@tori/shared"
import { deriveIncomeStatement } from "./income-statement.js"
import { deriveBalanceSheet } from "./balance-sheet.js"
import { deriveCashFlow } from "./cash-flow.js"

function deriveThreeStatements(drivers: FinancialModelDrivers): ThreeStatementOutput {
  const incomeStatement = deriveIncomeStatement(drivers)
  const balanceSheet = deriveBalanceSheet(drivers, incomeStatement)
  const cashFlowStatement = deriveCashFlow(drivers, incomeStatement)
  return { incomeStatement, balanceSheet, cashFlowStatement }
}

export { deriveThreeStatements }
