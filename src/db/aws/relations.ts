import { cypherS3ArnRegex } from "./arnUtils"
import {
  allowedServices,
  allowedAWSAccounts,
  allowedUsers,
  allowedAWSRoles,
  PolicyDoc,
  Action,
  IAMArn,
  PolicyStatement,
} from "./policyDocUtils"
import { isRight } from "fp-ts/lib/Either"
import { NodeLabel } from "./constants"
import { Transaction, Result } from "neo4j-driver"

const cypherActionRegex = (awsAction: Action) =>
  awsAction.fullAction.replace("*", ".*")

export function setupPolicyPolicyVersionsRelations(
  transaction: Transaction
): Promise<void> {
  return transaction
    .run(
      `MATCH (pv:${NodeLabel.POLICY_VERSION})
       MATCH (p:${NodeLabel.POLICY})
       WHERE p.arn = pv.policyArn OR p.name = pv.policyName
       MERGE (p)-[:HAS]->(pv)`
    )
    .then(() => undefined)
}

export type UnsupportedStatement = {
  policyVersionId: string
  policyName: string
  statement: PolicyStatement
}

// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_resource.html
export async function setupPolicyResourceRelations(
  transaction: Transaction,
  awsResource: NodeLabel,
  resourceMatcher: (arn: IAMArn) => boolean,
  actionMatcher: (arn: Action) => boolean
): Promise<
  {
    notResource: UnsupportedStatement[]
    notAction: UnsupportedStatement[]
    condition: UnsupportedStatement[]
  }[]
> {
  const policyVersions = await transaction.run(
    `MATCH (pv:${NodeLabel.POLICY_VERSION}) 
    RETURN pv.versionId AS versionId, pv.policyArn AS policyArn, pv.document AS document, pv.policyName AS policyName`
  )

  const statementsToProcess = policyVersions.records.flatMap((r) => {
    const policyArn: string = r.get("policyArn")
    const policyName: string = r.get("policyName")
    const policyVersionId: string = r.get("versionId")
    const parsedPolicyDoc = PolicyDoc.decode(JSON.parse(r.get("document")))

    let policyDoc: PolicyDoc
    if (isRight(parsedPolicyDoc)) {
      policyDoc = parsedPolicyDoc.right
    } else {
      throw new Error(`Policy ${policyName} contains invalid Policy document`)
    }

    const notResources = policyDoc.Statement.filter((statement) =>
      statement.NotResource.find(resourceMatcher)
    )

    const notActions = policyDoc.Statement.filter(
      (statement) =>
        (statement.NotResource.find(resourceMatcher) ||
          statement.Resource.find(resourceMatcher)) &&
        statement.NotAction.find(actionMatcher)
    )

    const conditions = policyDoc.Statement.filter(
      (statement) =>
        (statement.NotResource.find(resourceMatcher) ||
          statement.Resource.find(resourceMatcher)) &&
        Object.keys(statement.Condition).length > 0
    )

    const supportedStatements = policyDoc.Statement.flatMap((statement) =>
      statement.Resource.filter(resourceMatcher).map((r) => {
        const actions = statement.Action.filter(actionMatcher).map((a) => ({
          action: a.fullAction,
          regexAction: cypherActionRegex(a),
        }))
        return {
          actions,
          resource: r,
          statementString: JSON.stringify(statement),
          conditionString:
            Object.keys(statement.Condition).length > 0
              ? JSON.stringify(statement.Condition)
              : null,
          statement,
          policyArn,
          policyName,
          resourceArnRegex: cypherS3ArnRegex(r),
          policyDocumentVersionId: policyVersionId,
          allow: statement.Effect === "Allow",
        }
      })
    )

    const statementsWithName = (statements) =>
      statements.map((statement) => ({
        policyVersionId,
        policyName: policyArn || policyName,
        statement,
      }))

    return {
      supportedStatements,
      unsupportedStatements: {
        notResource: statementsWithName(notResources),
        notAction: statementsWithName(notActions),
        condition: statementsWithName(conditions),
      },
    }
  })

  await Promise.all(
    statementsToProcess
      .flatMap((stp) => stp.supportedStatements)
      .map((stp) =>
        transaction.run(
          `
          MATCH (pv:${
            NodeLabel.POLICY_VERSION
          }) WHERE (pv.versionId = $policyDocumentVersionId AND pv.policyArn = $policyArn) OR pv.policyName = $policyName
          MATCH (b:${awsResource}) WHERE b.arn =~ $resourceArnRegex
          UNWIND $actions AS a
          MERGE (pv)-[hp:${
            stp.allow ? "HAS_PERMISSION" : "HAS_NO_PERMISSION"
          } {action: a.action, regexAction: a.regexAction, prefix: $resource.resource, 
            policyStatement: $statementString}]-(b)
          ON CREATE SET hp.condition = $conditionString
          ON MATCH SET hp.condition = $conditionString
          `, // because of the "Cannot merge relationship using null property value for condition" problem
          stp
        )
      )
  )

  return statementsToProcess.flatMap((stp) => stp.unsupportedStatements)
}

export function setupLambdaRoleRelations(
  transaction: Transaction
): Promise<void> {
  return transaction
    .run(
      `
      MATCH (l:${NodeLabel.LAMBDA}) 
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = l.roleArn
      MERGE (l)-[:HAS]->(r)
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
              MERGE (r)-[:HAS]->(p)
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
    MERGE (r)-[:HAS]->(p)
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
      MERGE (gj)-[:HAS]->(r)
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
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, serviceName }
    )

  const accountLink = (roleArn: string, accountArn: string) =>
    transaction.run(
      `
      MATCH (s:${NodeLabel.AWS_ACCOUNT} {arn: $accountArn})
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, accountArn }
    )

  const userLink = (roleArn: string, userArn: string) =>
    transaction.run(
      `
      MATCH (s:${NodeLabel.AWS_USER} {arn: $userArn})
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, userArn }
    )

  const roleLink = (roleArn: string, sourceRoleArn: string) =>
    transaction.run(
      `
      MATCH (s:${NodeLabel.ROLE} {arn: $sourceRoleArn})
      MATCH (r:${NodeLabel.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
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
