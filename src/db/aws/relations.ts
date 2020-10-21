import { isS3Resource, cypherS3ArnRegex } from "./arnUtils"
import {
  allowedServices,
  allowedAWSAccounts,
  allowedUsers,
  allowedAWSRoles,
  PolicyDoc,
  Action,
} from "./policyDocUtils"
import { isRight } from "fp-ts/lib/Either"

import { nodeLabels } from "./constants"
import { Transaction, Record, Result } from "neo4j-driver"

const cypherActionRegex = (awsAction: Action) =>
  awsAction.fullAction.replace("*", ".*")

export function setupPolicyPolicyVersionsRelations(
  transaction: Transaction
): Promise<void> {
  return transaction
    .run(
      `MATCH (pv:${nodeLabels.POLICY_VERSION})
       MATCH (p:${nodeLabels.POLICY})
       WHERE p.arn = pv.policyArn OR p.name = pv.policyName
       MERGE (p)-[:HAS]->(pv)`
    )
    .then(() => undefined)
}

// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_resource.html
export async function setupPolicyBucketRelations(transaction: Transaction) {
  const policyVersions = await transaction.run(
    `MATCH (pv:${nodeLabels.POLICY_VERSION}) 
    RETURN pv.versionId AS versionId, pv.policyArn AS policyArn, pv.document AS document, pv.policyName AS policyName`
  )

  const statementsToProcess = policyVersions.records.flatMap((r) => {
    const parsedPolicyDoc = PolicyDoc.decode(JSON.parse(r.get("document")))
    const policyArn: string = r.get("policyArn")
    const policyName: string = r.get("policyName")
    const docVersion: string = r.get("versionId")

    let policyDoc: PolicyDoc
    if (isRight(parsedPolicyDoc)) {
      policyDoc = parsedPolicyDoc.right
    } else {
      throw new Error(`Policy ${policyArn} contains invalid Policy document`)
    }

    // const s3BucketStatements = policyDoc.Statement.flatMap((statement) =>
    //   statement.Resource.filter(isS3Resource).map((r) => {
    //     const actions = [statement.Action].flat().map((a) => ({
    //       action: a,
    //       regexAction: cypherActionRegex(a),
    //     }))
    //     return {
    //       ...statement,
    //       actions,
    //       Resource: r,
    //       policyArn,
    //       policyName,
    //       resourceArnRegex: cypherS3ArnRegex(r),
    //       policyDocumentVersionId: docVersion,
    //     }
    //   })
    // )

    const s3BucketStatements = policyDoc.Statement.reduce(
      (
        acc: {
          actions: {
            action: string
            regexAction: string
          }[]
          Resource: string
          policyArn: string
          policyName: string
          resourceArnRegex: string
          policyDocumentVersionId: string
        }[],
        statement
      ) => {
        const perResourceStatements = statement.Resource.filter(
          isS3Resource
        ).map((r) => {
          const actions = [statement.Action].flat().map((a) => ({
            action: a.fullAction,
            regexAction: cypherActionRegex(a),
          }))
          return {
            ...statement,
            actions,
            Resource: r.fullArn,
            policyArn,
            policyName,
            resourceArnRegex: cypherS3ArnRegex(r),
            policyDocumentVersionId: docVersion,
          }
        })
        return acc.concat(perResourceStatements)
      },
      []
    )

    return s3BucketStatements
  })

  return await Promise.all(
    statementsToProcess.map((stp) => {
      // console.log(stp)
      return transaction.run(
        `
        MATCH (pv:${nodeLabels.POLICY_VERSION}) WHERE (pv.versionId = $policyDocumentVersionId AND pv.policyArn = $policyArn) OR pv.policyName = $policyName
        MATCH (b:${nodeLabels.BUCKET}) WHERE b.arn =~ $resourceArnRegex
        UNWIND $actions as a 
        MERGE (pv)-[hp:HAS_PERMISSION {action: a.action, regexAction: a.regexAction}]-(b)
        ON MATCH SET hp.prefixes = hp.prefixes = [$Resource]
        `,
        stp
      )
    })
  )
}

export function setupLambdaRoleRelations(
  transaction: Transaction
): Promise<void> {
  return transaction
    .run(
      `
      MATCH (l:${nodeLabels.LAMBDA}) 
      MATCH (r:${nodeLabels.ROLE}) WHERE r.arn = l.roleArn
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
              MATCH (r:${nodeLabels.ROLE}) WHERE r.arn = $roleArn
              MATCH (p:${nodeLabels.CUSTOMER_MANAGED_POLICY}) WHERE p.arn = $policyArn
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
    MATCH (r:${nodeLabels.ROLE})
    MATCH (p:${nodeLabels.INLINE_POLICY}) WHERE p.roleName = r.name
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
      MATCH (gj:${nodeLabels.GLUE_JOB}) 
      MATCH (r:${nodeLabels.ROLE}) WHERE r.arn = gj.roleArn
      MERGE (gj)-[:HAS]->(r)
      `
    )
    .then(() => undefined)
}

type AllowAssume = {
  roleArn: string
  allowedAssume: string
}

export async function setupRoleAllowsAssumeRelations(
  transaction: Transaction
): Promise<void> {
  const roles = await transaction.run(
    `MATCH (r:${nodeLabels.ROLE}) WHERE r.assumeRolePolicyDocument <> '' RETURN r.arn AS arn, r.assumeRolePolicyDocument as doc`
  )

  const rolesToProcess = roles.records.reduce(
    (
      acc: {
        services: AllowAssume[]
        users: AllowAssume[]
        roles: AllowAssume[]
        accounts: AllowAssume[]
      }[],
      r: Record
    ) => {
      const roleArn = r.get("arn") as string
      const assumeRoleDoc = PolicyDoc.decode(JSON.parse(r.get("doc")))

      if (isRight(assumeRoleDoc)) {
        return acc.concat({
          services: allowedServices(assumeRoleDoc.right, roleArn),
          users: allowedUsers(assumeRoleDoc.right, roleArn),
          roles: allowedAWSRoles(assumeRoleDoc.right, roleArn),
          accounts: allowedAWSAccounts(assumeRoleDoc.right, roleArn),
        })
      } else {
        throw new Error(`Role ${roleArn} contains invalid Policy document`)
      }
    },
    []
  )

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
        .map((rtp) => rtp.services)
        .flat()
        .map((rtp) => rtp.allowedAssume),
      // services: uniquePrincipals(rolesToProcess, "services"),
      accounts: rolesToProcess
        .map((rtp) => rtp.accounts)
        .flat()
        .map((rtp) => rtp.allowedAssume),
      users: rolesToProcess
        .map((rtp) => rtp.users)
        .flat()
        .map((rtp) => rtp.allowedAssume),
    }
  )

  const serviceLink = (roleArn: string, serviceName: string) =>
    transaction.run(
      `
      MATCH (s:${nodeLabels.AWS_SERVICE} {awsName: $serviceName})
      MATCH (r:${nodeLabels.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, serviceName }
    )

  const accountLink = (roleArn: string, accountArn: string) =>
    transaction.run(
      `
      MATCH (s:${nodeLabels.AWS_ACCOUNT} {arn: $accountArn})
      MATCH (r:${nodeLabels.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, accountArn }
    )

  const userLink = (roleArn: string, userArn: string) =>
    transaction.run(
      `
      MATCH (s:${nodeLabels.AWS_USER} {arn: $userArn})
      MATCH (r:${nodeLabels.ROLE}) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, userArn }
    )

  const roleLink = (roleArn: string, sourceRoleArn: string) =>
    transaction.run(
      `
      MATCH (s:${nodeLabels.ROLE} {arn: $sourceRoleArn})
      MATCH (r:${nodeLabels.ROLE}) WHERE r.arn = $roleArn
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

  Promise.all(allLinks).then(() => undefined)
}

export default {
  setupPolicyPolicyVersionsRelations,
  setupPolicyBucketRelations,
  setupLambdaRoleRelations,
  setupRolePolicyRelations,
  setupGlueJobRoleRelations,
  setupRoleAllowsAssumeRelations,
}
