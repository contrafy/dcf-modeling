import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"
import {
  upsertScenario,
  findScenarioById,
  listAllScenarios,
  deleteScenario,
  upsertTariffPolicy,
  findPoliciesForScenario,
  deleteTariffPolicy,
} from "./scenario-repository.js"
import type { Scenario, TariffPolicy } from "@tori/shared"
import type { Neo4jConnection } from "./connection.js"

const TEST_URI = process.env["NEO4J_URI"] ?? "bolt://localhost:7687"
const TEST_USER = process.env["NEO4J_USER"] ?? "neo4j"
const TEST_PASSWORD = process.env["NEO4J_PASSWORD"] ?? "changeme"

const TEST_SCENARIO_PREFIX = "test-scenario-"
const TEST_POLICY_PREFIX = "test-policy-"

function makeScenario(id: string): Scenario {
  return {
    id: `${TEST_SCENARIO_PREFIX}${id}`,
    name: `Scenario ${id}`,
    description: "Test scenario",
    policies: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

function makePolicy(id: string, scenarioId: string): TariffPolicy {
  return {
    id: `${TEST_POLICY_PREFIX}${id}`,
    scenarioId,
    name: `Policy ${id}`,
    tariffPercent: 0.25,
    targetCountry: "Taiwan",
    targetSector: null,
    targetProduct: null,
    affectedEdgeIds: [],
  }
}

describe("scenario-repository", () => {
  let connection: Neo4jConnection

  beforeAll(async () => {
    connection = createNeo4jConnection({
      uri: TEST_URI,
      user: TEST_USER,
      password: TEST_PASSWORD,
    })
    await connection.verifyConnectivity()

    const session = connection.session()
    await session.run(
      `
      MATCH (s:Scenario)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      WHERE s.id STARTS WITH $prefix
      DETACH DELETE p
      `,
      { prefix: TEST_SCENARIO_PREFIX },
    )
    await session.run(
      `MATCH (s:Scenario) WHERE s.id STARTS WITH $prefix DELETE s`,
      { prefix: TEST_SCENARIO_PREFIX },
    )
    await session.close()
  })

  afterAll(async () => {
    const session = connection.session()
    await session.run(
      `
      MATCH (s:Scenario)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      WHERE s.id STARTS WITH $prefix
      DETACH DELETE p
      `,
      { prefix: TEST_SCENARIO_PREFIX },
    )
    await session.run(
      `MATCH (s:Scenario) WHERE s.id STARTS WITH $prefix DELETE s`,
      { prefix: TEST_SCENARIO_PREFIX },
    )
    await session.close()
    await closeNeo4jConnection(connection)
  })

  it("upserts a Scenario node and retrieves it by id", async () => {
    const scenario = makeScenario("base")
    await upsertScenario(connection, scenario)

    const found = await findScenarioById(connection, scenario.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(scenario.id)
    expect(found!.name).toBe(scenario.name)
    expect(found!.description).toBe(scenario.description)
    expect(found!.policies).toHaveLength(0)
  })

  it("returns null when scenario does not exist", async () => {
    const found = await findScenarioById(connection, "does-not-exist-xyz")
    expect(found).toBeNull()
  })

  it("lists all scenarios", async () => {
    await upsertScenario(connection, makeScenario("list-a"))
    await upsertScenario(connection, makeScenario("list-b"))

    const all = await listAllScenarios(connection)
    const ids = all.map((s) => s.id)

    expect(ids).toContain(`${TEST_SCENARIO_PREFIX}list-a`)
    expect(ids).toContain(`${TEST_SCENARIO_PREFIX}list-b`)
  })

  it("upserts a TariffPolicy linked to a Scenario and retrieves policies", async () => {
    const scenario = makeScenario("with-policy")
    await upsertScenario(connection, scenario)

    const policy = makePolicy("p1", scenario.id)
    await upsertTariffPolicy(connection, policy)

    const policies = await findPoliciesForScenario(connection, scenario.id)

    expect(policies).toHaveLength(1)
    expect(policies[0]!.id).toBe(policy.id)
    expect(policies[0]!.tariffPercent).toBe(0.25)
    expect(policies[0]!.targetCountry).toBe("Taiwan")
    expect(policies[0]!.targetSector).toBeNull()
    expect(policies[0]!.affectedEdgeIds).toHaveLength(0)
  })

  it("returns policies with affectedEdgeIds when populated", async () => {
    const scenario = makeScenario("manual-edges")
    await upsertScenario(connection, scenario)

    const policy: TariffPolicy = {
      ...makePolicy("p2", scenario.id),
      affectedEdgeIds: ["edge-a", "edge-b"],
    }
    await upsertTariffPolicy(connection, policy)

    const policies = await findPoliciesForScenario(connection, scenario.id)
    expect(policies[0]!.affectedEdgeIds).toEqual(["edge-a", "edge-b"])
  })

  it("deletes a tariff policy", async () => {
    const scenario = makeScenario("del-policy")
    await upsertScenario(connection, scenario)

    const policy = makePolicy("del-p1", scenario.id)
    await upsertTariffPolicy(connection, policy)
    await deleteTariffPolicy(connection, policy.id)

    const policies = await findPoliciesForScenario(connection, scenario.id)
    expect(policies).toHaveLength(0)
  })

  it("deletes a scenario and its policies", async () => {
    const scenario = makeScenario("del-full")
    await upsertScenario(connection, scenario)
    await upsertTariffPolicy(connection, makePolicy("del-full-p1", scenario.id))
    await deleteScenario(connection, scenario.id)

    const found = await findScenarioById(connection, scenario.id)
    expect(found).toBeNull()
  })

  it("findScenarioById includes policies in the result", async () => {
    const scenario = makeScenario("with-policies-full")
    await upsertScenario(connection, scenario)
    await upsertTariffPolicy(connection, makePolicy("full-p1", scenario.id))
    await upsertTariffPolicy(connection, makePolicy("full-p2", scenario.id))

    const found = await findScenarioById(connection, scenario.id)
    expect(found!.policies).toHaveLength(2)
  })
})
