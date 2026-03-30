import { describe, it, expect, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"

const TEST_URI = process.env["NEO4J_URI"] ?? "bolt://localhost:7687"
const TEST_USER = process.env["NEO4J_USER"] ?? "neo4j"
const TEST_PASSWORD = process.env["NEO4J_PASSWORD"] ?? "changeme"

describe("Neo4j connection", () => {
  it("connects to a running Neo4j instance and verifies connectivity", async () => {
    const connection = createNeo4jConnection({
      uri: TEST_URI,
      user: TEST_USER,
      password: TEST_PASSWORD,
    })

    await expect(connection.verifyConnectivity()).resolves.not.toThrow()

    await closeNeo4jConnection(connection)
  })

  it("exposes a session factory for running queries", async () => {
    const connection = createNeo4jConnection({
      uri: TEST_URI,
      user: TEST_USER,
      password: TEST_PASSWORD,
    })

    const session = connection.session()
    const result = await session.run("RETURN 1 AS n")
    const value = result.records[0]?.get("n")

    expect(Number(value)).toBe(1)

    await session.close()
    await closeNeo4jConnection(connection)
  })
})
