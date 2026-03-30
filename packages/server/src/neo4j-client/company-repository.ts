import type { Company } from "@dcf-modeling/shared"
import type { Neo4jConnection } from "./connection.js"

async function upsertCompany(
  connection: Neo4jConnection,
  company: Company,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MERGE (c:Company { ticker: $ticker })
      SET c.name = $name,
          c.sector = $sector,
          c.country = $country,
          c.marketCap = $marketCap,
          c.lastUpdated = $lastUpdated
      `,
      {
        ticker: company.ticker,
        name: company.name,
        sector: company.sector,
        country: company.country,
        marketCap: company.marketCap,
        lastUpdated: company.lastUpdated,
      },
    )
  } finally {
    await session.close()
  }
}

async function findCompanyByTicker(
  connection: Neo4jConnection,
  ticker: string,
): Promise<Company | null> {
  const session = connection.session()
  try {
    const result = await session.run(
      `MATCH (c:Company { ticker: $ticker }) RETURN c`,
      { ticker },
    )
    const record = result.records[0]
    if (!record) return null

    const node = record.get("c").properties as Record<string, unknown>
    return {
      ticker: node["ticker"] as string,
      name: node["name"] as string,
      sector: node["sector"] as string,
      country: node["country"] as string,
      marketCap: Number(node["marketCap"]),
      lastUpdated: node["lastUpdated"] as string,
    }
  } finally {
    await session.close()
  }
}

async function listAllCompanies(connection: Neo4jConnection): Promise<readonly Company[]> {
  const session = connection.session()
  try {
    const result = await session.run(`MATCH (c:Company) RETURN c ORDER BY c.ticker`)
    return result.records.map((record) => {
      const node = record.get("c").properties as Record<string, unknown>
      return {
        ticker: node["ticker"] as string,
        name: node["name"] as string,
        sector: node["sector"] as string,
        country: node["country"] as string,
        marketCap: Number(node["marketCap"]),
        lastUpdated: node["lastUpdated"] as string,
      }
    })
  } finally {
    await session.close()
  }
}

async function deleteCompany(
  connection: Neo4jConnection,
  ticker: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(`MATCH (c:Company { ticker: $ticker }) DELETE c`, { ticker })
  } finally {
    await session.close()
  }
}

export { upsertCompany, findCompanyByTicker, listAllCompanies, deleteCompany }
