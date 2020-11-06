import { Transaction } from "neo4j-driver"
import { RoleTableGrant } from "../../api/postgres"
import { dbUri, NodeLabel, RelationLabel } from "./constants"

async function setupSchemaDatabaseRelations(transaction: Transaction) {
  return transaction.run(
    `MATCH (db:${NodeLabel.DATABASE})
    MATCH (s:${NodeLabel.SCHEMA}) WHERE s.dbUri = db.dbUri
    MERGE (s)-[:${RelationLabel.BELONGS_TO}]->(db)
    `
  )
}

async function setupTableSchemaRelations(transaction: Transaction) {
  return transaction.run(
    `MATCH (t:${NodeLabel.TABLE})
    MATCH (s:${NodeLabel.SCHEMA}) 
    WHERE s.name = t.schemaName AND s.dbUri = t.dbUri
    MERGE (t)-[:${RelationLabel.BELONGS_TO}]->(s)
    `
  )
}

async function setupRoleRoleRelations(
  transaction: Transaction,
  roleMemberships: Map<string, string[]>
) {
  return Array.from(roleMemberships.entries())
    .map(([role, memberOfs]) => {
      return memberOfs.map(async (memberOf) =>
        transaction.run(
          `MATCH (source:${NodeLabel.ROLE}) WHERE source.name = $role
           MATCH (target:${NodeLabel.ROLE}) WHERE target.name = $memberOf AND source.dbUri = target.dbUri
           MERGE (source)-[:${RelationLabel.MEMBER_OF}]->(target)
            `,
          { role, memberOf }
        )
      )
    })
    .flat()
    .reduce((acc, promise) => acc.then(() => promise))
}

async function setupRoleTableRelations(
  transaction: Transaction,
  roleTableGrants: RoleTableGrant[],
  dbUri: string
) {
  return transaction.run(
    `
    UNWIND $roleTableGrants AS rtg
    MATCH (r:${NodeLabel.ROLE}) WHERE r.name = rtg.roleName AND r.dbUri = $dbUri
    MATCH (t:${NodeLabel.TABLE}) WHERE t.name = rtg.tableName AND t.dbUri = $dbUri AND t.schemaName = rtg.schemaName
    MERGE (r)-[:${RelationLabel.HAS_GRANT} {name: rtg.grant}]->(t)
    `,
    { roleTableGrants, dbUri }
  )
}

async function setupRoleDatabaseRelations(
  transaction: Transaction,
  roleTableGrants: RoleTableGrant[],
  dbUri: string
) {
  return transaction.run(
    `
    UNWIND $roleTableGrants AS rtg
    MATCH (r:${NodeLabel.ROLE}) WHERE r.name = rtg.roleName AND r.dbUri = $dbUri
    MATCH (db:${NodeLabel.DATABASE}) WHERE db.dbUri = $dbUri
    MERGE (r)-[:${RelationLabel.BELONGS_TO}]->(db)
    `,
    { roleTableGrants, dbUri }
  )
}

export default {
  setupSchemaDatabaseRelations,
  setupTableSchemaRelations,
  setupRoleTableRelations,
  setupRoleRoleRelations,
  setupRoleDatabaseRelations,
}
