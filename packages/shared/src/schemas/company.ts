import { z } from "zod"

const CompanySchema = z.object({
  ticker: z.string().min(1).max(10),
  name: z.string().min(1),
  sector: z.string().min(1),
  country: z.string().min(1),
  marketCap: z.number().nonnegative(),
  lastUpdated: z.string().datetime(),
})

const CreateCompanySchema = CompanySchema.omit({ lastUpdated: true })

export { CompanySchema, CreateCompanySchema }
