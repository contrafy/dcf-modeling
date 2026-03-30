import type { SupplyEdge } from "@dcf-modeling/shared"
import type { Neo4jConnection } from "./connection.js"

function recordToEdge(props: Record<string, unknown>, from: string, to: string): SupplyEdge {
  return {
    id: props["id"] as string,
    fromTicker: from,
    toTicker: to,
    revenueWeight: Number(props["revenueWeight"]),
    productCategory: props["productCategory"] as string,
    confidence: Number(props["confidence"]),
    source: props["source"] as "manual" | "llm" | "sec_filing",
    passthrough: Number(props["passthrough"]),
    lastVerified: props["lastVerified"] as string,
  }
}

async function upsertEdge(
  connection: Neo4jConnection,
  edge: SupplyEdge,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (from:Company { ticker: $fromTicker })
      MATCH (to:Company { ticker: $toTicker })
      MERGE (from)-[r:SUPPLIES_TO { id: $id }]->(to)
      SET r.revenueWeight = $revenueWeight,
          r.productCategory = $productCategory,
          r.confidence = $confidence,
          r.source = $source,
          r.passthrough = $passthrough,
          r.lastVerified = $lastVerified
      `,
      {
        id: edge.id,
        fromTicker: edge.fromTicker,
        toTicker: edge.toTicker,
        revenueWeight: edge.revenueWeight,
        productCategory: edge.productCategory,
        confidence: edge.confidence,
        source: edge.source,
        passthrough: edge.passthrough,
        lastVerified: edge.lastVerified,
      },
    )
  } finally {
    await session.close()
  }
}

async function findEdgeById(
  connection: Neo4jConnection,
  id: string,
): Promise<SupplyEdge | null> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (from:Company)-[r:SUPPLIES_TO { id: $id }]->(to:Company)
      RETURN r, from.ticker AS fromTicker, to.ticker AS toTicker
      `,
      { id },
    )
    const record = result.records[0]
    if (!record) return null

    const props = record.get("r").properties as Record<string, unknown>
    const from = record.get("fromTicker") as string
    const to = record.get("toTicker") as string
    return recordToEdge(props, from, to)
  } finally {
    await session.close()
  }
}

async function listEdgesForSupplier(
  connection: Neo4jConnection,
  ticker: string,
): Promise<readonly SupplyEdge[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (from:Company { ticker: $ticker })-[r:SUPPLIES_TO]->(to:Company)
      RETURN r, from.ticker AS fromTicker, to.ticker AS toTicker
      `,
      { ticker },
    )
    return result.records.map((record) => {
      const props = record.get("r").properties as Record<string, unknown>
      return recordToEdge(props, record.get("fromTicker"), record.get("toTicker"))
    })
  } finally {
    await session.close()
  }
}

async function listEdgesForCustomer(
  connection: Neo4jConnection,
  ticker: string,
): Promise<readonly SupplyEdge[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (from:Company)-[r:SUPPLIES_TO]->(to:Company { ticker: $ticker })
      RETURN r, from.ticker AS fromTicker, to.ticker AS toTicker
      `,
      { ticker },
    )
    return result.records.map((record) => {
      const props = record.get("r").properties as Record<string, unknown>
      return recordToEdge(props, record.get("fromTicker"), record.get("toTicker"))
    })
  } finally {
    await session.close()
  }
}

async function listAllEdges(
  connection: Neo4jConnection,
): Promise<readonly SupplyEdge[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (from:Company)-[r:SUPPLIES_TO]->(to:Company)
      RETURN r, from.ticker AS fromTicker, to.ticker AS toTicker
      `,
    )
    return result.records.map((record) => {
      const props = record.get("r").properties as Record<string, unknown>
      return recordToEdge(props, record.get("fromTicker"), record.get("toTicker"))
    })
  } finally {
    await session.close()
  }
}

async function updateEdge(
  connection: Neo4jConnection,
  id: string,
  patch: Partial<Pick<SupplyEdge, "revenueWeight" | "productCategory" | "confidence" | "passthrough">>,
): Promise<void> {
  const session = connection.session()
  try {
    const setClauses = Object.entries(patch)
      .map(([key]) => `r.${key} = $${key}`)
      .join(", ")

    if (setClauses === "") return

    await session.run(
      `MATCH ()-[r:SUPPLIES_TO { id: $id }]->() SET ${setClauses}`,
      { id, ...patch },
    )
  } finally {
    await session.close()
  }
}

async function deleteEdge(
  connection: Neo4jConnection,
  id: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `MATCH ()-[r:SUPPLIES_TO { id: $id }]->() DELETE r`,
      { id },
    )
  } finally {
    await session.close()
  }
}

export {
  upsertEdge,
  findEdgeById,
  listEdgesForSupplier,
  listEdgesForCustomer,
  listAllEdges,
  updateEdge,
  deleteEdge,
}
