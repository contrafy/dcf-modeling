import neo4j, { Driver, Session } from "neo4j-driver"

type Neo4jConfig = {
  readonly uri: string
  readonly user: string
  readonly password: string
}

type Neo4jConnection = {
  readonly verifyConnectivity: () => Promise<void>
  readonly session: () => Session
  readonly driver: Driver
}

function createNeo4jConnection(config: Neo4jConfig): Neo4jConnection {
  const driver = neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.user, config.password),
  )

  return {
    driver,
    verifyConnectivity: () => driver.verifyConnectivity().then(() => undefined),
    session: () => driver.session(),
  }
}

async function closeNeo4jConnection(connection: Neo4jConnection): Promise<void> {
  await connection.driver.close()
}

export { createNeo4jConnection, closeNeo4jConnection }
export type { Neo4jConfig, Neo4jConnection }
