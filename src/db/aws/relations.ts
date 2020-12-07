import { cypherS3ArnRegex, cypherActionRegex, cypherArnRegex } from "./arnUtils"
import {
  allowedServices,
  allowedAWSAccounts,
  allowedUsers,
  allowedAWSRoles,
  PolicyDoc,
  Action,
  IAMArn,
  PolicyStatement,
  ActionBlockType,
  ResourceBlockType,
  policyDocFromString,
} from "./policyDocUtils"
import { isRight } from "fp-ts/lib/Either"
import { NodeLabel, RelationLabel } from "./constants"
import { Transaction, Result, Record, QueryResult } from "neo4j-driver"
import { pascalToCamel } from "../../utils"

export function setupPolicyPolicyVersionsRelations(
  transaction: Transaction
): Promise<void> {
  return transaction
    .run(
      `MATCH (pv:${NodeLabel.POLICY_VERSION})
       MATCH (p:${NodeLabel.POLICY})
       WHERE p.arn = pv.policyArn OR p.name = pv.policyName
       MERGE (p)-[:${RelationLabel.HAS}]->(pv)`
    )
    .then(() => undefined)
}

/**
 * A statement may have an array of (Not)Action that is projected upon an
 * array of (Not)Resource. This function flattens these into a list of
 * all combinations that should be added as relations in the graph.
 */
const flattenedStatementProduct = (
  policyArn: string,
  policyName: string,
  policyVersionId: string
) => (statement: PolicyStatement) => {
  const actionRecourseCombinations = Object.values(ActionBlockType).flatMap(
    (actionType) =>
      Object.values(ResourceBlockType).map((resourceType) => ({
        actionType,
        resourceType,
      }))
  )

  return actionRecourseCombinations.flatMap(({ actionType, resourceType }) =>
    statement[actionType].flatMap((action: Action) =>
      statement[resourceType].map((resource: IAMArn) => ({
        actionType,
        resourceType,
        policyArn,
        policyName,
        policyVersionId,
        effect: statement.Effect,
        actionService: action.service,
        resourceService: resource.service,
        action: action.fullAction,
        resource: resource.fullArn,
        actionRegex: cypherActionRegex(action),
        resourceRegex: cypherArnRegex(resource),
        conditionString:
          Object.keys(statement.Condition).length > 0
            ? JSON.stringify(statement.Condition)
            : null,
      }))
    )
  )
}

export type UnsupportedStatement = {
  policyVersionId: string
  policyName: string
  statement: PolicyStatement | undefined
}

// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_resource.html
export async function setupPolicyResourceRelations(
  transaction
): Promise<{
  notResource: UnsupportedStatement[]
  notAction: UnsupportedStatement[]
  condition: UnsupportedStatement[]
}> {
  const policyVersions: QueryResult = await transaction.run(
    `MATCH (pv:${NodeLabel.POLICY_VERSION}) 
    RETURN pv.versionId AS versionId, pv.policyArn AS policyArn, pv.document AS document, pv.policyName AS policyName`
  )

  const statementsToProcess = policyVersions.records.flatMap((r) => {
    const policyArn: string = r.get("policyArn")
    const policyName: string = r.get("policyName")
    const policyVersionId: string = r.get("versionId")
    const policyDoc = policyDocFromString(policyName, r.get("document"))
    const statementProduct = flattenedStatementProduct(
      policyArn,
      policyName,
      policyVersionId
    )

    return policyDoc.Statement.flatMap(statementProduct)
  })

  const supportedStatements = statementsToProcess.filter(
    (stp) =>
      stp.actionType === ActionBlockType.Action &&
      stp.resourceType === ResourceBlockType.Resource
  )

  await transaction.run(
    `
    UNWIND $statementsToProcess AS stp
    MATCH (pv:${NodeLabel.POLICY_VERSION}) WHERE (pv.versionId = stp.policyVersionId AND pv.policyArn = stp.policyArn) OR pv.policyName = stp.policyName
    MATCH (b:${NodeLabel.AWS_RESOURCE}) WHERE b.arn =~ stp.resourceRegex AND b.service = stp.actionService
    MERGE (pv)-[hp:${RelationLabel.HAS_PERMISSION} {action: stp.action, regexAction: stp.actionRegex}]-(b)
    ON CREATE SET hp.condition = stp.conditionString
    ON MATCH SET hp.condition = stp.conditionString
    `, // because of the "Cannot merge relationship using null property value for condition" problem
    {
      statementsToProcess: supportedStatements,
    }
  )

  const toUnsupportedStatement = (stp): UnsupportedStatement => ({
    policyVersionId: stp.policyVersionId,
    policyName: stp.policyName || stp.policyArn,
    statement: undefined,
  })

  return {
    notResource: statementsToProcess
      .filter((stp) => stp.resourceType === ResourceBlockType.NotResource)
      .map(toUnsupportedStatement),
    notAction: statementsToProcess
      .filter((stp) => stp.actionType === ActionBlockType.NotAction)
      .map(toUnsupportedStatement),
    condition: statementsToProcess
      .filter((stp) => !!stp.conditionString)
      .map(toUnsupportedStatement),
  }
}

export function setupLambdaRoleRelations(
  transaction: Transaction
): Promise<void> {
  return transaction
    .run(
      `
      MATCH (l:${NodeLabel.LAMBDA}) 
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = l.roleArn
      MERGE (l)-[:${RelationLabel.HAS}]->(r)
      `
    )
    .then(() => undefined)
}

export async function setupRolePolicyRelations(
  transaction: Transaction,
  roleAndPolicies
) {
  const insertResults = await Promise.all(
    roleAndPolicies.flatMap((role) => {
      return Promise.all(
        role.attachedPolicies.map((ap) =>
          transaction.run(
            `
              MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = $roleArn
              MATCH (p:${NodeLabel.CUSTOMER_MANAGED_POLICY}) WHERE p.arn = $policyArn
              MERGE (r)-[:${RelationLabel.HAS}]->(p)
              `,
            { roleArn: role.Arn, policyArn: ap.PolicyArn }
          )
        )
      )
    })
  )

  await transaction.run(
    `
    MATCH (r:${NodeLabel.ROLE})
    MATCH (p:${NodeLabel.INLINE_POLICY}) WHERE p.roleName = r.name
    MERGE (r)-[:${RelationLabel.HAS}]->(p)
    `
  )

  // Return value doesn't really make sense here anymore because it is not all we did.
  return insertResults
}

export async function setupGlueJobRoleRelations(
  transaction: Transaction
): Promise<void> {
  return transaction
    .run(
      `
      MATCH (gj:${NodeLabel.GLUE_JOB}) 
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = gj.roleArn
      MERGE (gj)-[:${RelationLabel.HAS}]->(r)
      `
    )
    .then(() => undefined)
}

export async function setupRoleAllowsAssumeRelations(
  transaction: Transaction
): Promise<void> {
  const roles = await transaction.run(
    `MATCH (r:${NodeLabel.ROLE}) WHERE r.assumeRolePolicyDocument <> '' RETURN r.arn AS arn, r.assumeRolePolicyDocument as doc`
  )

  const rolesToProcess = roles.records.flatMap((r) => {
    const roleArn = r.get("arn") as string
    const assumeRoleDoc = PolicyDoc.decode(JSON.parse(r.get("doc")))

    if (isRight(assumeRoleDoc)) {
      return {
        services: allowedServices(assumeRoleDoc.right, roleArn),
        users: allowedUsers(assumeRoleDoc.right, roleArn),
        roles: allowedAWSRoles(assumeRoleDoc.right, roleArn),
        accounts: allowedAWSAccounts(assumeRoleDoc.right, roleArn),
      }
    } else {
      throw new Error(`Role ${roleArn} contains invalid Policy document`)
    }
  })

  await transaction.run(
    `
    UNWIND $services as s MERGE (:AWSService {awsName: s})
    WITH 1 AS one
    UNWIND $accounts as a MERGE (:AWSAccount {arn: a})
    WITH 2 AS two
    UNWIND $users as u MERGE (:AWSUser {arn: u})
    `,
    {
      services: rolesToProcess
        .flatMap((rtp) => rtp.services)
        .map((rtp) => rtp.allowedAssume),
      accounts: rolesToProcess
        .flatMap((rtp) => rtp.accounts)
        .map((rtp) => rtp.allowedAssume),
      users: rolesToProcess
        .flatMap((rtp) => rtp.users)
        .map((rtp) => rtp.allowedAssume),
    }
  )

  const serviceLink = (roleArn: string, serviceName: string) =>
    transaction.run(
      `
      MATCH (s:${NodeLabel.AWS_SERVICE} {awsName: $serviceName})
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:${RelationLabel.CAN_ASSUME}]->(r)
      `,
      { roleArn, serviceName }
    )

  const accountLink = (roleArn: string, accountArn: string) =>
    transaction.run(
      `
      MATCH (s:${NodeLabel.AWS_ACCOUNT} {arn: $accountArn})
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:${RelationLabel.CAN_ASSUME}]->(r)
      `,
      { roleArn, accountArn }
    )

  const userLink = (roleArn: string, userArn: string) =>
    transaction.run(
      `
      MATCH (s:${NodeLabel.AWS_USER} {arn: $userArn})
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:${RelationLabel.CAN_ASSUME}]->(r)
      `,
      { roleArn, userArn }
    )

  const roleLink = (roleArn: string, sourceRoleArn: string) =>
    transaction.run(
      `
      MATCH (s:${NodeLabel.ROLE} {arn: $sourceRoleArn})
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:${RelationLabel.CAN_ASSUME}]->(r)
      `,
      { roleArn, sourceRoleArn }
    )

  const allLinks = rolesToProcess
    .reduce((acc: Result[], rtp) => {
      const serviceLinks = rtp.services.map((s) =>
        serviceLink(s.roleArn, s.allowedAssume)
      )
      const accountLinks = rtp.accounts.map((a) =>
        accountLink(a.roleArn, a.allowedAssume)
      )
      const userLinks = rtp.users.map((u) =>
        userLink(u.roleArn, u.allowedAssume)
      )
      const roleLinks = rtp.roles.map((r) =>
        roleLink(r.roleArn, r.allowedAssume)
      )

      return acc.concat(serviceLinks, accountLinks, userLinks, roleLinks)
    }, [])
    .flat()

  return Promise.all(allLinks).then(() => undefined)
}

export default {
  setupPolicyPolicyVersionsRelations,
  setupPolicyResourceRelations,
  setupLambdaRoleRelations,
  setupRolePolicyRelations,
  setupGlueJobRoleRelations,
  setupRoleAllowsAssumeRelations,
}
