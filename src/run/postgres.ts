import postgres, { ConnectionInfo } from "../api/postgres"
import neo4j from "neo4j-driver"
import dbNodes from "../db/postgres/nodes"
import dbRelations from "../db/postgres/relations"

export async function run(neo4jCredentials, pgConnectionInfo: ConnectionInfo) {
  const driver = neo4j.driver(
    neo4jCredentials.host,
    neo4j.auth.basic(neo4jCredentials.user, neo4jCredentials.password)
  )
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE })
  // await session.run("MATCH (a) DETACH DELETE a")
  const transaction = session.beginTransaction()

  const pgDatabases = [{ ...pgConnectionInfo, name: pgConnectionInfo.database }]
  await dbNodes.upsertDatabases(transaction, pgDatabases)

  const pgSchemas = await postgres.fetchSchemas(pgConnectionInfo)
  await dbNodes.upsertSchema(transaction, pgSchemas)

  const tables = await postgres.fetchTables(pgConnectionInfo)
  await dbNodes.upsertTables(transaction, tables)

  const pgRoles = await postgres.fetchRoles(pgConnectionInfo)
  await dbNodes.upsertRoles(
    transaction,
    pgRoles.map((r) => ({
      ...r,
      databaseName: pgConnectionInfo.database,
    }))
  )

  await dbRelations.setupSchemaDatabaseRelations(transaction)
  await dbRelations.setupTableSchemaRelations(transaction)

  const roleMapping = pgRoles.reduce(
    (acc, role) => acc.set(role.name, role.memberOfRoles),
    new Map<string, string[]>()
  )
  await dbRelations.setupRoleRoleRelations(transaction, roleMapping)

  const roleTableGrants = await postgres.fetchRoleTableGrants(pgConnectionInfo)
  await dbRelations.setupRoleTableRelations(transaction, roleTableGrants)
  await dbRelations.setupRoleDatabaseRelations(transaction, roleTableGrants)

  await transaction.commit()
  session.close()
  driver.close()
}
