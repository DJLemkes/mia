import postgres from "../api/postgres"
import neo4j from "neo4j-driver"
import dbNodes from "../db/postgres/nodes"
import dbRelations from "../db/postgres/relations"
import { string } from "yargs"

export async function run(dbCredentials) {
  const connectionInfo = {
    user: "postgres",
    host: "localhost",
    database: "postgres",
    password: "mia",
    port: 5432,
  }

  const driver = neo4j.driver(
    dbCredentials.host,
    neo4j.auth.basic(dbCredentials.user, dbCredentials.password)
  )
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE })
  await session.run("MATCH (a) DETACH DELETE a")
  const transaction = session.beginTransaction()

  const pgDatabases = [{ ...connectionInfo, name: connectionInfo.database }]
  await dbNodes.upsertDatabases(transaction, pgDatabases)

  const pgSchemas = await postgres.fetchSchemas(connectionInfo)
  await dbNodes.upsertSchema(transaction, pgSchemas)

  const tables = await postgres.fetchTables(connectionInfo)
  await dbNodes.upsertTables(transaction, tables)

  const pgRoles = await postgres.fetchRoles(connectionInfo)
  await dbNodes.upsertRoles(
    transaction,
    pgRoles.map((r) => ({ ...r, databaseName: connectionInfo.database }))
  )

  await dbRelations.setupSchemaDatabaseRelations(transaction)
  await dbRelations.setupTableSchemaRelations(transaction)

  const roleMapping = pgRoles.reduce(
    (acc, role) => acc.set(role.name, role.memberOfRoles),
    new Map<string, string[]>()
  )
  await dbRelations.setupRoleRoleRelations(transaction, roleMapping)

  const roleTableGrants = await postgres.fetchRoleTableGrants(connectionInfo)
  await dbRelations.setupRoleTableRelations(transaction, roleTableGrants)

  await transaction.commit()
  session.close()
  driver.close()
}
