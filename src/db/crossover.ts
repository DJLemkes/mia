import { NodeLabel as AWSNodeLabl } from "./aws/constants"
import { NodeLabel as PostgresNodeLabl } from "./postgres/constants"
import { RelationLabel } from "./constants"
import { Transaction } from "neo4j-driver"
import { PolicyDoc } from "./aws/policyDocUtils"
import { isRight } from "fp-ts/lib/Either"
import util from "util"

export async function setupAWSPostgresRelations(transaction: Transaction) {
  const policyVersions = await transaction.run(
    `MATCH (pv:${AWSNodeLabl.POLICY_VERSION}) 
    RETURN ID(pv) as pvNodeId, pv.document AS document`
  )

  const relations = policyVersions.records.map((r) => {
    const nodeId = r.get("pvNodeId") as string
    const parsedPolicyDoc = PolicyDoc.decode(JSON.parse(r.get("document")))

    let policyDoc: PolicyDoc
    if (isRight(parsedPolicyDoc)) {
      policyDoc = parsedPolicyDoc.right
    } else {
      throw new Error(
        `Policy with node ID ${nodeId} contains invalid Policy document`
      )
    }

    // TODO: warn of unsupported NotAction and NotResource elements
    const postgresNodes = policyDoc.Statement.filter(
      (stmt) =>
        !!stmt.Action.find(
          (a) => a.service === "rds-db" && a.action === "connect"
        )
    )
      .flatMap((stmt) => stmt.Resource)
      .filter((r) => r.service === "rds-db" && r.resource === "dbuser")
      .map((arn) => ({
        // TODO: account for '*' names
        rdsId: arn.resourceId.split("/")[0],
        dbUser: arn.resourceId.split("/")[1],
        region: arn.region,
      }))

    return {
      nodeId,
      postgresNodes,
    }
  })

  return transaction.run(
    `
    UNWIND $relations as r
    MATCH (pv:${AWSNodeLabl.POLICY_VERSION}) WHERE ID(pv) = r.nodeId
    UNWIND r.postgresNodes as pgNode
    MATCH (pgr:${PostgresNodeLabl.ROLE})-[*]->(pdb:${PostgresNodeLabl.DATABASE})
    WHERE pgr.name = pgNode.dbUser AND pdb.rdsId = pgNode.rdsId AND pdb.rdsRegion = pgNode.region
    MERGE (pv)-[:${RelationLabel.CAN_CONNECT_AS}]->(pgr)
    `,
    { relations }
  )
}
