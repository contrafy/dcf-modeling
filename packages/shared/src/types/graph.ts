import type { Company } from "./company.js"
import type { FinancialModel } from "./financial-model.js"
import type { DCFResult } from "./dcf.js"

type SupplyEdge = {
  readonly id: string
  readonly fromTicker: string
  readonly toTicker: string
  readonly revenueWeight: number
  readonly productCategory: string
  readonly confidence: number
  readonly source: "manual" | "llm" | "sec_filing"
  readonly passthrough: number
  readonly lastVerified: string
}

type CompanyNode = {
  readonly company: Company
  readonly financialModel: FinancialModel
  readonly computedDCF: DCFResult | null
}

type SupplyChainGraph = {
  readonly nodes: ReadonlyMap<string, CompanyNode>
  readonly edges: readonly SupplyEdge[]
  readonly adjacency: ReadonlyMap<string, readonly SupplyEdge[]>
}

export type { SupplyEdge, CompanyNode, SupplyChainGraph }
