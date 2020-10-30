import { Transaction } from "neo4j-driver"
import { RoleTableGrant } from "../../api/postgres"
import { NodeLabel } from "./constants"

async function setupSchemaDatabaseRelations(transaction: Transaction) {
  return transaction.run(
    `MATCH (db:${NodeLabel.DATABASE})
    MATCH (s:${NodeLabel.SCHEMA}) WHERE s.databaseName = db.name
    MERGE (s)-[:BELONGS_TO]->(db)
    `
  )
}

async function setupTableSchemaRelations(transaction: Transaction) {
  return transaction.run(
    `MATCH (t:${NodeLabel.TABLE})
    MATCH (s:${NodeLabel.SCHEMA}) 
    WHERE s.name = t.schemaName AND s.databaseName = t.databaseName
    MERGE (t)-[:BELONGS_TO]->(s)
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
           MATCH (target:${NodeLabel.ROLE}) WHERE target.name = $memberOf AND source.databaseName = target.databaseName
           MERGE (source)-[:MEMBER_OF]->(target)
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
  roleTableGrants: RoleTableGrant[]
) {
  return transaction.run(
    `
    UNWIND $roleTableGrants AS rtg
    MATCH (r:${NodeLabel.ROLE}) WHERE r.name = rtg.roleName AND r.databaseName = rtg.databaseName
    MATCH (t:${NodeLabel.TABLE}) WHERE t.name = rtg.tableName AND t.databaseName = rtg.databaseName AND t.schemaName = rtg.schemaName
    MERGE (r)-[:HAS_GRANT {name: rtg.grant}]->(t)
    `,
    { roleTableGrants }
  )
}

export default {
  setupSchemaDatabaseRelations,
  setupTableSchemaRelations,
  setupRoleTableRelations,
  setupRoleRoleRelations,
}
