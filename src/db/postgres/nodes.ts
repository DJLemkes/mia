import { Transaction } from "neo4j-driver"
import { NodeLabel } from "./constants"

type DbPostgresDatabase = {
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
  return transaction.run(
    `UNWIND $databases as db 
     MERGE (:${NodeLabel.POSTGRES_RESOURCE}:${NodeLabel.DATABASE} 
            {name: db.name, host: db.host, port: db.port,
             rdsId: db.rdsId, rdsRegion: db.rdsRegion})
    `,
    { databases }
  )
}

type DbPostgresSchema = {
  name: string
  databaseName: string
  owner: string
}

async function upsertSchema(
  transaction: Transaction,
  schemas: DbPostgresSchema[]
) {
  return transaction.run(
    `UNWIND $schemas as s
     MERGE (:${NodeLabel.POSTGRES_RESOURCE}:${NodeLabel.SCHEMA} 
            {name: s.name, databaseName: s.databaseName, owner: s.owner})
    `,
    { schemas }
  )
}

type DbPostgresTable = {
  name: string
  owner: string
  schemaName: string
  databaseName: string
}

async function upsertTables(
  transaction: Transaction,
  tables: DbPostgresTable[]
) {
  return transaction.run(
    `UNWIND $tables as t
     MERGE (:${NodeLabel.POSTGRES_RESOURCE}:${NodeLabel.TABLE} 
            {name: t.name, databaseName: t.databaseName, 
             schemaName: t.schemaName, owner: t.owner})
    `,
    { tables }
  )
}

type DbPostgresRole = {
  name: string
  databaseName: string
  superUser: boolean
  inherit: boolean
  createRole: boolean
  createDatabase: boolean
  canLogin: boolean
}

async function upsertRoles(transaction: Transaction, roles: DbPostgresRole[]) {
  return transaction.run(
    `UNWIND $roles as r
     MERGE (:${NodeLabel.POSTGRES_RESOURCE}:${NodeLabel.ROLE} 
            {name: r.name, databaseName: r.databaseName, 
             superUser: r.superUser, inherit: r.inherit,
             createRole: r.createRole, createDatabase: r.createDatabase,
             canLogin: r.canLogin})
    `,
    { roles }
  )
}

export default {
  upsertDatabases,
  upsertRoles,
  upsertSchema,
  upsertTables,
}
