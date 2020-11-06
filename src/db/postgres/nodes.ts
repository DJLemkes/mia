import { Transaction } from "neo4j-driver"
import { NodeLabel, dbUri as realDbUri } from "./constants"

const dbUri = (db: DbPostgresDatabase) => realDbUri(db.host, db.port, db.name)

export type DbPostgresDatabase = {
  name: string
  host: string
  port: number
  rdsId?: string
  rdsRegion?: string
}

async function upsertDatabases(
  transaction: Transaction,
  databases: DbPostgresDatabase[]
) {
  const _databases = databases.map((db) => ({ ...db, dbUri: dbUri(db) }))
  return transaction.run(
    `UNWIND $_databases as db 
     MERGE (:${NodeLabel.POSTGRES_RESOURCE}:${NodeLabel.DATABASE} 
            {name: db.name, host: db.host, port: db.port, dbUri: db.dbUri, 
             rdsId: db.rdsId, rdsRegion: db.rdsRegion})
    `,
    { _databases }
  )
}

type DbPostgresSchema = {
  name: string
  database: DbPostgresDatabase
  owner: string
}

async function upsertSchema(
  transaction: Transaction,
  schemas: DbPostgresSchema[]
) {
  const _schemas = schemas.map((s) => ({ ...s, dbUri: dbUri(s.database) }))
  return transaction.run(
    `UNWIND $_schemas as s
     MERGE (:${NodeLabel.POSTGRES_RESOURCE}:${NodeLabel.SCHEMA} 
            {name: s.name, owner: s.owner, dbUri: s.dbUri})
    `,
    { _schemas }
  )
}

type DbPostgresTable = {
  name: string
  owner: string
  schemaName: string
  database: DbPostgresDatabase
}

async function upsertTables(
  transaction: Transaction,
  tables: DbPostgresTable[]
) {
  const _tables = tables.map((t) => ({ ...t, dbUri: dbUri(t.database) }))
  return transaction.run(
    `UNWIND $_tables as t
     MERGE (:${NodeLabel.POSTGRES_RESOURCE}:${NodeLabel.TABLE} 
            {name: t.name, schemaName: t.schemaName, owner: t.owner, dbUri: t.dbUri})
    `,
    { _tables }
  )
}

type DbPostgresRole = {
  name: string
  database: DbPostgresDatabase
  superUser: boolean
  inherit: boolean
  createRole: boolean
  createDatabase: boolean
  canLogin: boolean
}

async function upsertRoles(transaction: Transaction, roles: DbPostgresRole[]) {
  const _roles = roles.map((r) => ({ ...r, dbUri: dbUri(r.database) }))
  return transaction.run(
    `UNWIND $_roles as r
     MERGE (:${NodeLabel.POSTGRES_RESOURCE}:${NodeLabel.ROLE} 
            {name: r.name, superUser: r.superUser, inherit: r.inherit,
             createRole: r.createRole, createDatabase: r.createDatabase,
             canLogin: r.canLogin, dbUri: r.dbUri})
    `,
    { _roles }
  )
}

export default {
  upsertDatabases,
  upsertRoles,
  upsertSchema,
  upsertTables,
}
