import postgres, { ConnectionInfo } from "../api/postgres"
import { Session, Transaction } from "neo4j-driver"
import dbNodes, { DbPostgresDatabase } from "../db/postgres/nodes"
import dbRelations from "../db/postgres/relations"
import { Config } from "./config"
import { dbUri as createDbUri } from "../db/postgres/constants"

export function confirmationQuestion(config: Config): string | undefined {
  const allDatabases = (config.postgres?.instances || []).map(
    (info) =>
      `${info.host}:${info.port}/${info.database} with user ${info.user}`
  )

  const question = `Going to visit the following Postgres databases:
  ${allDatabases.join("\n")}\n`

  return allDatabases.length > 0 ? question : undefined
}

const withDatabase = <T>(db: DbPostgresDatabase) => (o: T) => ({
  ...o,
  database: db,
})

async function runOneHost(
  transaction: Transaction,
  pgConnectionInfo: ConnectionInfo
) {
  const pgDatabase = { ...pgConnectionInfo, name: pgConnectionInfo.database }
  const dbUri = createDbUri(pgDatabase.host, pgDatabase.port, pgDatabase.name)

  const withCurrentDatabase: <T>(
    o: T
  ) => T & { database: DbPostgresDatabase } = withDatabase(pgDatabase)

  await dbNodes.upsertDatabases(transaction, [pgDatabase])

  const pgSchemas = await postgres.fetchSchemas(pgConnectionInfo)
  await dbNodes.upsertSchema(transaction, pgSchemas.map(withCurrentDatabase))

  const tables = await postgres.fetchTables(pgConnectionInfo)
  await dbNodes.upsertTables(transaction, tables.map(withCurrentDatabase))

  const pgRoles = await postgres.fetchRoles(pgConnectionInfo)
  await dbNodes.upsertRoles(transaction, pgRoles.map(withCurrentDatabase))

  await dbRelations.setupSchemaDatabaseRelations(transaction)
  await dbRelations.setupTableSchemaRelations(transaction)

  const roleMapping = pgRoles.reduce(
    (acc, role) => acc.set(role.name, role.memberOfRoles),
    new Map<string, string[]>()
  )
  await dbRelations.setupRoleRoleRelations(transaction, roleMapping)

  const roleTableGrants = await postgres.fetchRoleTableGrants(pgConnectionInfo)
  await dbRelations.setupRoleTableRelations(transaction, roleTableGrants, dbUri)
  await dbRelations.setupRoleDatabaseRelations(
    transaction,
    roleTableGrants,
    dbUri
  )
}

export async function run(session: Session, config: Config) {
  const transaction = session.beginTransaction()

  for (const host of config.postgres?.instances || []) {
    await runOneHost(transaction, host)
  }

  await transaction.commit()
}
