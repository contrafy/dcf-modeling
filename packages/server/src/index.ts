import express, { type Express } from "express"
import { createServer } from "node:http"
import { Server } from "socket.io"
import { randomUUID } from "node:crypto"
import { createApiRouter } from "./api/index.js"
import { createSocketHandler } from "./websocket/index.js"

import type { GraphRepository } from "./api/graph-router.js"
import type { FinancialRepository } from "./api/financial-router.js"
import type { ScenarioRepository } from "./api/scenario-router.js"
import type { SimulationService } from "./api/simulation-router.js"
import type { ExtractionService } from "./api/extraction-router.js"
import type { DataAdapterOrchestrator } from "./api/data-router.js"

import {
  createNeo4jConnection,
  upsertCompany,
  findCompanyByTicker,
  listAllCompanies,
  deleteCompany,
  upsertEdge,
  findEdgeById,
  listAllEdges,
  updateEdge,
  deleteEdge,
  findFinancialModelByTicker,
  upsertFinancialModel,
  listAllScenarios,
  findScenarioById,
  upsertScenario,
  upsertTariffPolicy,
  deleteTariffPolicy,
} from "./neo4j-client/index.js"

import { createFmpAdapter, createYahooAdapter, createAdapterOrchestrator } from "./data-adapters/index.js"
import { createEdgarAdapter } from "./data-adapters/edgar-adapter.js"

import { createGraph, addNode, addEdge as graphAddEdge } from "./graph-engine/index.js"
import { propagateShock } from "./graph-engine/index.js"

import { calculateDCF } from "./dcf-engine/index.js"
import { mergeDrivers } from "./dcf-engine/index.js"

import { createGroqClient, createExtractionPipeline } from "./llm-service/index.js"

import type {
  Company,
  FinancialModel,
  FinancialModelDrivers,
  SupplyEdge,
  CompanyNode,
  SupplyChainGraph,
  Scenario,
  TariffPolicy,
} from "@dcf-modeling/shared"

// -- Neo4j connection ----------------------------------------------------------

const neo4jUri = process.env["NEO4J_URI"] ?? "bolt://localhost:7687"
const neo4jUser = process.env["NEO4J_USER"] ?? "neo4j"
const neo4jPassword = process.env["NEO4J_PASSWORD"] ?? "changeme"

const neo4jConnection = createNeo4jConnection({
  uri: neo4jUri,
  user: neo4jUser,
  password: neo4jPassword,
})

neo4jConnection.verifyConnectivity().then(() => {
  console.log("Neo4j connection verified")
}).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.warn(`Neo4j connectivity check failed -- continuing anyway: ${message}`)
})

// -- Helpers: build an in-memory SupplyChainGraph from Neo4j -------------------

async function buildSupplyChainGraph(): Promise<SupplyChainGraph> {
  const [companies, edges] = await Promise.all([
    listAllCompanies(neo4jConnection),
    listAllEdges(neo4jConnection),
  ])

  const financialModels = await Promise.all(
    companies.map((c) => findFinancialModelByTicker(neo4jConnection, c.ticker)),
  )

  let graph = createGraph()

  companies.forEach((company, i) => {
    const model = financialModels[i]
    if (!model) return

    const node: CompanyNode = {
      company,
      financialModel: model,
      computedDCF: null,
    }
    graph = addNode(graph, node)
  })

  for (const edge of edges) {
    graph = graphAddEdge(graph, edge)
  }

  return graph
}

// -- Default financial model drivers for new companies -------------------------

const DEFAULT_DRIVERS: FinancialModelDrivers = {
  revenue: 0,
  revenueGrowthRate: 0.05,
  cogsPercent: 0.6,
  sgaPercent: 0.1,
  rdPercent: 0.05,
  daPercent: 0.04,
  interestExpense: 0,
  taxRate: 0.21,
  cashAndEquivalents: 0,
  accountsReceivable: 0,
  inventory: 0,
  ppe: 0,
  totalDebt: 0,
  accountsPayable: 0,
  capexPercent: 0.04,
  nwcChange: 0,
  wacc: 0.1,
  terminalGrowthRate: 0.03,
  projectionYears: 5,
  sharesOutstanding: 1,
}

// -- GraphRepository -----------------------------------------------------------

const graphRepo: GraphRepository = {
  async getGraph() {
    const [companies, edges] = await Promise.all([
      listAllCompanies(neo4jConnection),
      listAllEdges(neo4jConnection),
    ])
    return { nodes: [...companies], edges: [...edges] }
  },

  async addCompany(data) {
    const raw = data as Partial<Company> & { ticker: string; name: string }
    const company: Company = {
      ticker: raw.ticker,
      name: raw.name,
      sector: raw.sector ?? "Unknown",
      country: raw.country ?? "Unknown",
      marketCap: raw.marketCap ?? 0,
      lastUpdated: new Date().toISOString(),
    }
    await upsertCompany(neo4jConnection, company)

    const existing = await findFinancialModelByTicker(neo4jConnection, company.ticker)
    if (!existing) {
      const model: FinancialModel = {
        companyTicker: company.ticker,
        fiscalYear: new Date().getFullYear(),
        drivers: DEFAULT_DRIVERS,
        overrides: {},
      }
      await upsertFinancialModel(neo4jConnection, model)
    }

    return company
  },

  async removeCompany(ticker) {
    await deleteCompany(neo4jConnection, ticker)
  },

  async addEdge(data) {
    const raw = data as Partial<SupplyEdge> & {
      fromTicker: string
      toTicker: string
    }
    const edge: SupplyEdge = {
      id: raw.id ?? randomUUID(),
      fromTicker: raw.fromTicker,
      toTicker: raw.toTicker,
      revenueWeight: raw.revenueWeight ?? 0,
      productCategory: raw.productCategory ?? "",
      confidence: raw.confidence ?? 1,
      source: raw.source ?? "manual",
      passthrough: raw.passthrough ?? 0.5,
      lastVerified: new Date().toISOString(),
    }
    await upsertEdge(neo4jConnection, edge)
    return edge
  },

  async removeEdge(id) {
    await deleteEdge(neo4jConnection, id)
  },

  async updateEdge(id, data) {
    const patch = data as Partial<Pick<SupplyEdge, "revenueWeight" | "productCategory" | "confidence" | "passthrough">>
    await updateEdge(neo4jConnection, id, patch)
    return findEdgeById(neo4jConnection, id)
  },
}

// -- FinancialRepository -------------------------------------------------------

const financialRepo: FinancialRepository = {
  async getFinancials(ticker) {
    return findFinancialModelByTicker(neo4jConnection, ticker)
  },

  async updateFinancials(ticker, data) {
    const existing = await findFinancialModelByTicker(neo4jConnection, ticker)

    const raw = data as {
      drivers?: Partial<FinancialModelDrivers>
      overrides?: Partial<FinancialModelDrivers>
      fiscalYear?: number
    }

    const baseDrivers = existing?.drivers ?? DEFAULT_DRIVERS
    const model: FinancialModel = {
      companyTicker: ticker,
      fiscalYear: raw.fiscalYear ?? existing?.fiscalYear ?? new Date().getFullYear(),
      drivers: raw.drivers ? { ...baseDrivers, ...raw.drivers } : baseDrivers,
      overrides: raw.overrides ?? existing?.overrides ?? {},
    }

    await upsertFinancialModel(neo4jConnection, model)
    const updated = await findFinancialModelByTicker(neo4jConnection, ticker)
    if (!updated) {
      throw new Error(`Financial model for ${ticker} not found after update`)
    }
    return updated
  },

  async recalculateDCF(ticker) {
    const model = await findFinancialModelByTicker(neo4jConnection, ticker)
    if (!model) {
      throw new Error(`Financial model for ${ticker} not found`)
    }
    const effectiveDrivers = mergeDrivers(model.drivers, model.overrides)
    return calculateDCF(effectiveDrivers)
  },
}

// -- ScenarioRepository --------------------------------------------------------

const scenarioRepo: ScenarioRepository = {
  async listScenarios() {
    return listAllScenarios(neo4jConnection) as Promise<Scenario[]>
  },

  async createScenario(data) {
    const raw = data as { name: string; description?: string }
    const scenario: Scenario = {
      id: randomUUID(),
      name: raw.name,
      description: raw.description ?? "",
      policies: [],
      createdAt: new Date().toISOString(),
    }
    await upsertScenario(neo4jConnection, scenario)
    return scenario
  },

  async getScenario(id) {
    return findScenarioById(neo4jConnection, id)
  },

  async addPolicy(scenarioId, data) {
    const raw = data as {
      name: string
      tariffPercent: number
      targetCountry: string
      targetSector?: string | null
      targetProduct?: string | null
      affectedEdgeIds?: string[]
    }
    const policy: TariffPolicy = {
      id: randomUUID(),
      scenarioId,
      name: raw.name,
      tariffPercent: raw.tariffPercent,
      targetCountry: raw.targetCountry,
      targetSector: raw.targetSector ?? null,
      targetProduct: raw.targetProduct ?? null,
      affectedEdgeIds: raw.affectedEdgeIds ?? [],
    }
    await upsertTariffPolicy(neo4jConnection, policy)
    return policy
  },

  async removePolicy(_scenarioId, policyId) {
    await deleteTariffPolicy(neo4jConnection, policyId)
  },
}

// -- SimulationService ---------------------------------------------------------

const simulationService: SimulationService = {
  async runSimulation(scenarioId, onStep) {
    const scenario = await findScenarioById(neo4jConnection, scenarioId)
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`)
    }

    const graph = await buildSupplyChainGraph()
    const result = propagateShock(graph, scenario.policies)

    // Emit a step per affected company so the frontend gets streaming updates
    let iteration = 1
    for (const impact of result.impacts.values()) {
      if (impact.delta !== 0) {
        onStep({
          iteration,
          affectedTicker: impact.ticker,
          previousValuation: impact.baselineValuation,
          newValuation: impact.shockedValuation,
          delta: impact.delta,
        })
        iteration++
      }
    }

    return result
  },
}

// -- ExtractionService ---------------------------------------------------------

function buildExtractionService(): ExtractionService {
  const edgarAdapter = createEdgarAdapter()

  let pipeline: ReturnType<typeof createExtractionPipeline> | null = null

  function getOrCreatePipeline(): ReturnType<typeof createExtractionPipeline> {
    if (pipeline) return pipeline
    try {
      const llmClient = createGroqClient()
      pipeline = createExtractionPipeline({
        fetchFilingText: async (ticker) => {
          const cik = await edgarAdapter.resolveCik(ticker)
          const filings = await edgarAdapter.listRecentFilings(cik, "10-K", 1)
          const filing = filings[0]
          if (!filing) {
            throw new Error(`No 10-K filing found for ${ticker}`)
          }
          return edgarAdapter.fetchFilingText(ticker, filing.accessionNumber)
        },
        llmClient,
      })
      return pipeline
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Extraction pipeline unavailable: ${message}`)
    }
  }

  const pendingExtractions = new Map<
    string,
    {
      ticker: string
      suppliers: readonly {
        name: string
        ticker: string
        relationship: string
        productCategory: string
        estimatedRevenueWeight: number
        confidence: number
        source: string
      }[]
      customers: readonly {
        name: string
        ticker: string
        relationship: string
        productCategory: string
        estimatedRevenueWeight: number
        confidence: number
        source: string
      }[]
    }
  >()

  return {
    async extractSupplyChain(ticker, onProgress) {
      onProgress("started", `Starting extraction for ${ticker}`)

      let llmPipeline: ReturnType<typeof createExtractionPipeline>
      try {
        llmPipeline = getOrCreatePipeline()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        onProgress("error", message)
        throw err
      }

      onProgress("fetching", `Fetching SEC filing for ${ticker}`)
      onProgress("extracting", `Extracting supply chain relationships for ${ticker}`)

      const llmResult = await llmPipeline.extract(ticker)

      const extractionId = randomUUID()

      pendingExtractions.set(extractionId, {
        ticker,
        suppliers: llmResult.suppliers,
        customers: llmResult.customers,
      })

      onProgress("done", `Extraction complete for ${ticker}`)

      return {
        company: llmResult.company,
        ticker,
        extractionId,
        suppliers: llmResult.suppliers,
        customers: llmResult.customers,
      }
    },

    async approveExtraction(extractionId, approvedIds) {
      const extraction = pendingExtractions.get(extractionId)
      if (!extraction) return

      const approvedSet = new Set(approvedIds)
      const allRelationships = [
        ...extraction.suppliers,
        ...extraction.customers,
      ]

      const toApprove = allRelationships.filter((_rel, i) =>
        approvedSet.has(String(i)),
      )

      for (const rel of toApprove) {
        if (!rel.ticker) continue

        const existingCompany = await findCompanyByTicker(neo4jConnection, rel.ticker)
        if (!existingCompany) {
          const company: Company = {
            ticker: rel.ticker,
            name: rel.name,
            sector: "Unknown",
            country: "Unknown",
            marketCap: 0,
            lastUpdated: new Date().toISOString(),
          }
          await upsertCompany(neo4jConnection, company)
          const model: FinancialModel = {
            companyTicker: rel.ticker,
            fiscalYear: new Date().getFullYear(),
            drivers: DEFAULT_DRIVERS,
            overrides: {},
          }
          await upsertFinancialModel(neo4jConnection, model)
        }

        const sourceCompanyExists = await findCompanyByTicker(neo4jConnection, extraction.ticker)
        if (!sourceCompanyExists) continue

        const isSupplier = extraction.suppliers.some((s) => s.ticker === rel.ticker && s.name === rel.name)
        const edge: SupplyEdge = {
          id: randomUUID(),
          fromTicker: isSupplier ? rel.ticker : extraction.ticker,
          toTicker: isSupplier ? extraction.ticker : rel.ticker,
          revenueWeight: rel.estimatedRevenueWeight,
          productCategory: rel.productCategory,
          confidence: rel.confidence,
          source: "llm",
          passthrough: 0.5,
          lastVerified: new Date().toISOString(),
        }
        await upsertEdge(neo4jConnection, edge)
      }

      pendingExtractions.delete(extractionId)
    },
  }
}

const extractionService = buildExtractionService()

// -- DataAdapterOrchestrator ---------------------------------------------------

function buildDataOrchestrator(): DataAdapterOrchestrator {
  const fmpApiKey = process.env["FMP_API_KEY"]

  const primaryAdapter = fmpApiKey
    ? createFmpAdapter({ apiKey: fmpApiKey })
    : createYahooAdapter()

  const fallbackAdapter = createYahooAdapter()

  const orchestrator = createAdapterOrchestrator({
    primary: primaryAdapter,
    fallback: fallbackAdapter,
  })

  return {
    async fetchAndStore(ticker) {
      const [financials, marketData] = await Promise.all([
        orchestrator.fetchFinancials(ticker, 1),
        orchestrator.fetchMarketData(ticker),
      ])

      const latestIncome = financials.incomeStatements[0]
      const latestBalance = financials.balanceSheets[0]
      const latestCashFlow = financials.cashFlows[0]

      const company: Company = {
        ticker,
        name: financials.companyName,
        sector: financials.sector,
        country: financials.country,
        marketCap: marketData.marketCap,
        lastUpdated: new Date().toISOString(),
      }

      await upsertCompany(neo4jConnection, company)

      if (latestIncome && latestBalance && latestCashFlow) {
        const revenue = latestIncome.revenue
        const drivers: FinancialModelDrivers = {
          revenue,
          revenueGrowthRate: 0.05,
          cogsPercent: revenue > 0 ? latestIncome.cogs / revenue : 0.6,
          sgaPercent: revenue > 0 ? latestIncome.operatingExpenses / revenue : 0.1,
          rdPercent: 0.05,
          daPercent: revenue > 0 ? latestCashFlow.da / revenue : 0.04,
          interestExpense: latestIncome.interestExpense,
          taxRate: 0.21,
          cashAndEquivalents: latestBalance.cashAndEquivalents,
          accountsReceivable: latestBalance.accountsReceivable,
          inventory: latestBalance.inventory,
          ppe: latestBalance.ppe,
          totalDebt: latestBalance.totalDebt,
          accountsPayable: latestBalance.accountsPayable,
          capexPercent: revenue > 0 ? latestCashFlow.capex / revenue : 0.04,
          nwcChange: 0,
          wacc: 0.1,
          terminalGrowthRate: 0.03,
          projectionYears: 5,
          sharesOutstanding: marketData.sharesOutstanding > 0
            ? marketData.sharesOutstanding
            : 1,
        }

        const model: FinancialModel = {
          companyTicker: ticker,
          fiscalYear: latestIncome.fiscalYear,
          drivers,
          overrides: {},
        }

        await upsertFinancialModel(neo4jConnection, model)
      }

      return {
        ticker,
        source: fmpApiKey ? "fmp" : "yahoo",
        revenue: latestIncome?.revenue ?? 0,
        fiscalYear: latestIncome?.fiscalYear ?? new Date().getFullYear(),
      }
    },
  }
}

const dataOrchestrator = buildDataOrchestrator()

// -- Express + Socket.io setup -------------------------------------------------

const app: Express = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: "*" },
})

const socketHandler = createSocketHandler(io)

app.use(express.json())
app.use(
  "/api",
  createApiRouter({
    graphRepo,
    financialRepo,
    scenarioRepo,
    simulationService,
    extractionService,
    dataOrchestrator,
    socketHandler,
  }),
)

io.on("connection", (socket) => {
  socketHandler.onConnection(socket)
})

const PORT = process.env["PORT"] ?? 3000

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export { app, httpServer, io }
