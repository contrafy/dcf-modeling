import type { Scenario, TariffPolicy } from "@dcf-modeling/shared"
import type { Neo4jConnection } from "./connection.js"

function recordToPolicy(p: Record<string, unknown>): TariffPolicy {
  const raw = p["affectedEdgeIds"]
  const affectedEdgeIds: readonly string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === "string" && raw !== ""
      ? (JSON.parse(raw) as string[])
      : []

  return {
    id: p["id"] as string,
    scenarioId: p["scenarioId"] as string,
    name: p["name"] as string,
    tariffPercent: Number(p["tariffPercent"]),
    targetCountry: p["targetCountry"] as string,
    targetSector: (p["targetSector"] as string | null) ?? null,
    targetProduct: (p["targetProduct"] as string | null) ?? null,
    affectedEdgeIds,
  }
}

async function upsertScenario(
  connection: Neo4jConnection,
  scenario: Scenario,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MERGE (s:Scenario { id: $id })
      SET s.name = $name,
          s.description = $description,
          s.createdAt = $createdAt
      `,
      {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        createdAt: scenario.createdAt,
      },
    )
  } finally {
    await session.close()
  }
}

async function findScenarioById(
  connection: Neo4jConnection,
  id: string,
): Promise<Scenario | null> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (s:Scenario { id: $id })
      OPTIONAL MATCH (s)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      RETURN s, collect(p) AS policies
      `,
      { id },
    )
    const record = result.records[0]
    if (!record) return null

    const s = record.get("s").properties as Record<string, unknown>
    const rawPolicies = record.get("policies") as Array<{ properties: Record<string, unknown> } | null>
    const policies = rawPolicies
      .filter((p): p is { properties: Record<string, unknown> } => p !== null)
      .map((p) => recordToPolicy(p.properties))

    return {
      id: s["id"] as string,
      name: s["name"] as string,
      description: s["description"] as string,
      createdAt: s["createdAt"] as string,
      policies,
    }
  } finally {
    await session.close()
  }
}

async function listAllScenarios(
  connection: Neo4jConnection,
): Promise<readonly Scenario[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (s:Scenario)
      OPTIONAL MATCH (s)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      RETURN s, collect(p) AS policies
      ORDER BY s.createdAt
      `,
    )
    return result.records.map((record) => {
      const s = record.get("s").properties as Record<string, unknown>
      const rawPolicies = record.get("policies") as Array<{ properties: Record<string, unknown> } | null>
      const policies = rawPolicies
        .filter((p): p is { properties: Record<string, unknown> } => p !== null)
        .map((p) => recordToPolicy(p.properties))

      return {
        id: s["id"] as string,
        name: s["name"] as string,
        description: s["description"] as string,
        createdAt: s["createdAt"] as string,
        policies,
      }
    })
  } finally {
    await session.close()
  }
}

async function deleteScenario(
  connection: Neo4jConnection,
  id: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (s:Scenario { id: $id })
      OPTIONAL MATCH (s)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      DETACH DELETE s, p
      `,
      { id },
    )
  } finally {
    await session.close()
  }
}

async function upsertTariffPolicy(
  connection: Neo4jConnection,
  policy: TariffPolicy,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (s:Scenario { id: $scenarioId })
      MERGE (s)-[:CONTAINS_POLICY]->(p:TariffPolicy { id: $id })
      SET p.scenarioId = $scenarioId,
          p.name = $name,
          p.tariffPercent = $tariffPercent,
          p.targetCountry = $targetCountry,
          p.targetSector = $targetSector,
          p.targetProduct = $targetProduct,
          p.affectedEdgeIds = $affectedEdgeIds
      `,
      {
        id: policy.id,
        scenarioId: policy.scenarioId,
        name: policy.name,
        tariffPercent: policy.tariffPercent,
        targetCountry: policy.targetCountry,
        targetSector: policy.targetSector,
        targetProduct: policy.targetProduct,
        affectedEdgeIds: [...policy.affectedEdgeIds],
      },
    )
  } finally {
    await session.close()
  }
}

async function findPoliciesForScenario(
  connection: Neo4jConnection,
  scenarioId: string,
): Promise<readonly TariffPolicy[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (s:Scenario { id: $scenarioId })-[:CONTAINS_POLICY]->(p:TariffPolicy)
      RETURN p
      `,
      { scenarioId },
    )
    return result.records.map((record) => {
      const p = record.get("p").properties as Record<string, unknown>
      return recordToPolicy(p)
    })
  } finally {
    await session.close()
  }
}

async function deleteTariffPolicy(
  connection: Neo4jConnection,
  id: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `MATCH (p:TariffPolicy { id: $id }) DETACH DELETE p`,
      { id },
    )
  } finally {
    await session.close()
  }
}

export {
  upsertScenario,
  findScenarioById,
  listAllScenarios,
  deleteScenario,
  upsertTariffPolicy,
  findPoliciesForScenario,
  deleteTariffPolicy,
}
