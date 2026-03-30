import { z } from "zod"

const percent = z.number().min(0).max(1)
const positiveNumber = z.number().nonnegative()

const FinancialModelDriversSchema = z.object({
  revenue: positiveNumber,
  revenueGrowthRate: z.number(),
  cogsPercent: percent,
  sgaPercent: percent,
  rdPercent: percent,
  daPercent: percent,
  interestExpense: z.number(),
  taxRate: percent,
  cashAndEquivalents: positiveNumber,
  accountsReceivable: positiveNumber,
  inventory: positiveNumber,
  ppe: positiveNumber,
  totalDebt: positiveNumber,
  accountsPayable: positiveNumber,
  capexPercent: percent,
  nwcChange: z.number(),
  wacc: z.number().positive(),
  terminalGrowthRate: z.number(),
  projectionYears: z.number().int().min(1).max(20),
  sharesOutstanding: positiveNumber,
})

const FinancialModelSchema = z.object({
  companyTicker: z.string().min(1),
  fiscalYear: z.number().int().min(1900).max(2100),
  drivers: FinancialModelDriversSchema,
  overrides: FinancialModelDriversSchema.partial(),
})

const UpdateFinancialModelSchema = z.object({
  drivers: FinancialModelDriversSchema.partial().optional(),
  overrides: FinancialModelDriversSchema.partial().optional(),
})

export {
  FinancialModelDriversSchema,
  FinancialModelSchema,
  UpdateFinancialModelSchema,
}
