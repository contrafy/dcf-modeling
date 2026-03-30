import type { FinancialModel, FinancialModelDrivers } from "@tori/shared"
import type { Neo4jConnection } from "./connection.js"

async function upsertFinancialModel(
  connection: Neo4jConnection,
  model: FinancialModel,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (c:Company { ticker: $companyTicker })
      MERGE (c)-[:HAS_MODEL]->(m:FinancialModel { companyTicker: $companyTicker })
      SET m.fiscalYear = $fiscalYear,
          m.revenue = $revenue,
          m.revenueGrowthRate = $revenueGrowthRate,
          m.cogsPercent = $cogsPercent,
          m.sgaPercent = $sgaPercent,
          m.rdPercent = $rdPercent,
          m.daPercent = $daPercent,
          m.interestExpense = $interestExpense,
          m.taxRate = $taxRate,
          m.cashAndEquivalents = $cashAndEquivalents,
          m.accountsReceivable = $accountsReceivable,
          m.inventory = $inventory,
          m.ppe = $ppe,
          m.totalDebt = $totalDebt,
          m.accountsPayable = $accountsPayable,
          m.capexPercent = $capexPercent,
          m.nwcChange = $nwcChange,
          m.wacc = $wacc,
          m.terminalGrowthRate = $terminalGrowthRate,
          m.projectionYears = $projectionYears,
          m.sharesOutstanding = $sharesOutstanding,
          m.overrides = $overrides
      `,
      {
        companyTicker: model.companyTicker,
        fiscalYear: model.fiscalYear,
        ...model.drivers,
        overrides: JSON.stringify(model.overrides),
      },
    )
  } finally {
    await session.close()
  }
}

async function findFinancialModelByTicker(
  connection: Neo4jConnection,
  ticker: string,
): Promise<FinancialModel | null> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (c:Company { ticker: $ticker })-[:HAS_MODEL]->(m:FinancialModel)
      RETURN m
      `,
      { ticker },
    )
    const record = result.records[0]
    if (!record) return null

    const p = record.get("m").properties as Record<string, unknown>

    const drivers: FinancialModelDrivers = {
      revenue: Number(p["revenue"]),
      revenueGrowthRate: Number(p["revenueGrowthRate"]),
      cogsPercent: Number(p["cogsPercent"]),
      sgaPercent: Number(p["sgaPercent"]),
      rdPercent: Number(p["rdPercent"]),
      daPercent: Number(p["daPercent"]),
      interestExpense: Number(p["interestExpense"]),
      taxRate: Number(p["taxRate"]),
      cashAndEquivalents: Number(p["cashAndEquivalents"]),
      accountsReceivable: Number(p["accountsReceivable"]),
      inventory: Number(p["inventory"]),
      ppe: Number(p["ppe"]),
      totalDebt: Number(p["totalDebt"]),
      accountsPayable: Number(p["accountsPayable"]),
      capexPercent: Number(p["capexPercent"]),
      nwcChange: Number(p["nwcChange"]),
      wacc: Number(p["wacc"]),
      terminalGrowthRate: Number(p["terminalGrowthRate"]),
      projectionYears: Number(p["projectionYears"]),
      sharesOutstanding: Number(p["sharesOutstanding"]),
    }

    const overrides = p["overrides"]
      ? (JSON.parse(p["overrides"] as string) as Partial<FinancialModelDrivers>)
      : {}

    return {
      companyTicker: p["companyTicker"] as string,
      fiscalYear: Number(p["fiscalYear"]),
      drivers,
      overrides,
    }
  } finally {
    await session.close()
  }
}

async function deleteFinancialModel(
  connection: Neo4jConnection,
  ticker: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (c:Company { ticker: $ticker })-[:HAS_MODEL]->(m:FinancialModel)
      DETACH DELETE m
      `,
      { ticker },
    )
  } finally {
    await session.close()
  }
}

export { upsertFinancialModel, findFinancialModelByTicker, deleteFinancialModel }
