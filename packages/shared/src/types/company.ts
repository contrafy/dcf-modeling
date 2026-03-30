type CompanySource = "manual" | "llm" | "sec_filing"

type Company = {
  readonly ticker: string
  readonly name: string
  readonly sector: string
  readonly country: string
  readonly marketCap: number
  readonly lastUpdated: string
}

export type { Company, CompanySource }
