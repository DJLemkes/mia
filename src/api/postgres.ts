// import { ConnectionNotification } from "aws-sdk/clients/ec2"
import { Client } from "pg"

export type ConnectionInfo = {
  user: string
  host: string
  database: string
  password: string
  port: number
}

type TableInfo = {
  name: string
  schemaName: string
  databaseName: string
  owner: string
}

async function fetchTables(
  connectionInfo: ConnectionInfo
): Promise<TableInfo[]> {
  const excludedSchemas = ["pg_catalog", "information_schema"]
  const client = new Client(connectionInfo)
  await client.connect()
  return client
    .query(
      `SELECT schemaname, tablename AS name, 
       tableowner AS owner FROM pg_catalog.pg_tables;`
    )
    .then((data) =>
      data.rows
        .filter((r) => excludedSchemas.indexOf(r.schemaname) === -1)
        .map((r) => ({
          ...r,
          schemaName: r.schemaname,
          databaseName: connectionInfo.database,
        }))
    )
}

type SchemaInfo = {
  name: string
  owner: string
  databaseName: string
}

async function fetchSchemas(
  connectionInfo: ConnectionInfo
): Promise<SchemaInfo[]> {
  const client = new Client(connectionInfo)
  await client.connect()
  return client
    .query(
      "SELECT schema_name AS name, schema_owner AS owner FROM information_schema.schemata;"
    )
    .then((data) =>
      data.rows.map((r) => ({ ...r, databaseName: connectionInfo.database }))
    )
}

type RoleInfo = {
  name: string
  superUser: boolean
  inherit: boolean
  createRole: boolean
  createDatabase: boolean
  canLogin: boolean
  memberOfRoles: string[]
}

async function fetchRoles(connectionInfo: ConnectionInfo): Promise<RoleInfo[]> {
  // https://www.postgresql.org/docs/10/sql-createrole.html
  const query = `
  -- https://dba.stackexchange.com/questions/145739/postgres-list-role-grants-for-all-users
  SELECT 
      r.rolname, 
      r.rolsuper, 
      r.rolinherit,
      r.rolcreaterole,
      r.rolcreatedb,
      r.rolcanlogin,
      r.rolconnlimit, r.rolvaliduntil,
  ARRAY(SELECT b.rolname
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles b ON (m.roleid = b.oid)
        WHERE m.member = r.oid) as memberof,
      r.rolreplication,
      r.rolbypassrls
  FROM pg_catalog.pg_roles r
  ORDER BY 1;
  `

  const client = new Client(connectionInfo)
  await client.connect()
  return client.query(query).then((data) =>
    data.rows.map((r) => ({
      name: r.rolname,
      superUser: r.rolsuper,
      inherit: r.rolinherit,
      createRole: r.rolcreaterole,
      createDatabase: r.rolcreatedb,
      canLogin: r.rolcanlogin,
      memberOfRoles: (r.memberof as string)
        .replace("{", "")
        .replace("}", "")
        .split(","),
    }))
  )
}

export type RoleTableGrant = {
  roleName: string
  tableName: string
  schemaName: string
  databaseName: string
  grant: string
}

async function fetchRoleTableGrants(
  connectionInfo: ConnectionInfo
): Promise<RoleTableGrant[]> {
  const query = `
  SELECT grantor, grantee as role_name, table_name, table_schema, privilege_type 
  FROM information_schema.role_table_grants;
  `
  const client = new Client(connectionInfo)
  await client.connect()
  return client.query(query).then((data) =>
    data.rows.map((r) => ({
      roleName: r.role_name,
      tableName: r.table_name,
      schemaName: r.table_schema,
      databaseName: connectionInfo.database,
      grant: r.privilege_type,
    }))
  )
}

export default { fetchTables, fetchSchemas, fetchRoles, fetchRoleTableGrants }
