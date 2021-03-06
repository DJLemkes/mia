import AWS, { STS } from "aws-sdk"
// import AWS from "aws-sdk"
import { Session } from "neo4j-driver"
import ora from "ora"
import { matchesAction, matchesResource } from "../db/aws/arnUtils"
import { NodeLabel } from "../db/aws/constants"
import { warning } from "log-symbols"
import pLimit from "p-limit"
import s3 from "../api/aws/s3"
import iam from "../api/aws/iam"
import lambda from "../api/aws/lambda"
import glue from "../api/aws/glue"
import athena from "../api/aws/athena"
import dbNodes from "../db/aws/nodes"
import { filterUndefined } from "../utils"
import dbRelations, { UnsupportedStatement } from "../db/aws/relations"
import { Config } from "./config"

const logUnsupported = (
  unsupported: UnsupportedStatement[],
  spinner: ora.Ora
) => {
  unsupported
    .reduce((acc, statement) => {
      const versionText = statement.policyVersionId
        ? ` at version ${statement.policyVersionId}`
        : ""
      return acc.add(`${statement.policyName}${versionText}`)
    }, new Set<string>())
    .forEach((logLine) =>
      spinner.stopAndPersist({
        symbol: warning,
        text: logLine,
      })
    )
}

export function confirmationQuestion(config: Config): string | undefined {
  const regions = config.aws?.regions || []
  const profile = config.aws?.cliProfile || "default"
  const awsCredentials = new AWS.SharedIniFileCredentials({
    profile: profile,
  })

  const question =
    `Going to use access key Id ${awsCredentials.accessKeyId} ` +
    `from profile ${profile} in region(s) ${regions}`

  return config.aws ? question : undefined
}

export async function run(config: Config, session: Session) {
  const regions = config.aws?.regions || []
  const profile = config.aws?.cliProfile || "default"
  const awsCredentials = new AWS.SharedIniFileCredentials({
    profile: profile,
  })
  AWS.config.credentials = awsCredentials
  const transaction = session.beginTransaction()

  const roles = await iam.timedFetchRoles()
  await dbNodes.upsertRoles(transaction, roles)

  // const inlineRolePolicies = await iam.timedFetchInlineRolePolicies(
  //   roles.map((r) => r.RoleName)
  // )
  // await dbNodes.upsertInlineRolePolicies(transaction, inlineRolePolicies)

  // const policies = await iam.timedFetchPolicies()
  // await dbNodes.upsertPolicies(transaction, policies)
  // const allPolicyVersions = await iam.timedFetchPolicyVersions(
  //   filterUndefined(policies.map((p) => p.Arn))
  // )

  // await Promise.all(
  //   allPolicyVersions.map((pv) =>
  //     dbNodes.upsertPolicyVersions(transaction, pv.Arn, pv.Versions)
  //   )
  // )

  // const regionLimit = pLimit(1)
  // await Promise.all(
  //   regions.map((region) =>
  //     regionLimit(async () => {
  //       AWS.config.region = region
  //       console.log(`Processing region ${AWS.config.region}...`)

  //       const awsAccountId = (await await (
  //         await new STS().getCallerIdentity().promise()
  //       ).Account) as string

  //       const buckets = await s3.fetchBuckets()
  //       await dbNodes.upsertBuckets(transaction, buckets)

  //       const lambdaFunctions = await lambda.timedFetchLambdas()
  //       await dbNodes.upsertLambdas(transaction, lambdaFunctions)

  //       const glueJobs = await glue.timedFetchGlueJobs(awsAccountId)
  //       await dbNodes.upsertGlueJobs(transaction, glueJobs)

  //       const glueDatabases = await glue.timedfetchGlueDatabases(awsAccountId)
  //       await dbNodes.upsertGlueDatabases(transaction, glueDatabases)

  //       const glueTables = await glue.timedfetchGlueTables(awsAccountId)
  //       await dbNodes.upsertGlueTables(transaction, glueTables)

  //       const athenaWorkgroups = await athena.timedFetchWorkGroups(awsAccountId)
  //       await dbNodes.upsertAthenaWorkgroups(transaction, athenaWorkgroups)
  //     })
  //   )
  // )

  const relationsSpinner = ora("Setting up relations...").start()
  await dbRelations.setupRolePolicyRelations(transaction, roles)
  await dbRelations.setupPolicyPolicyVersionsRelations(transaction)
  await dbRelations.setupRoleAllowsAssumeRelations(transaction)
  await dbRelations.setupLambdaRoleRelations(transaction)
  await dbRelations.setupGlueJobRoleRelations(transaction)
  const skippedStatements = await dbRelations.setupPolicyResourceRelations(
    transaction
  )

  if (skippedStatements.condition.length > 0) {
    relationsSpinner.stopAndPersist({
      symbol: warning,
      text:
        "IAM 'Condition' statements are not yet fully being processed. " +
        "We annotated relations with the 'Condition' statement when we encountered them in:",
    })
    logUnsupported(skippedStatements.condition, relationsSpinner)
  }

  if (skippedStatements.notAction.length > 0) {
    relationsSpinner.stopAndPersist({
      symbol: warning,
      text: `Skipping statement(s) in the following policies because the contain unsupported NotAction elements`,
    })
    logUnsupported(skippedStatements.notAction, relationsSpinner)
  }

  if (skippedStatements.notResource.length > 0) {
    relationsSpinner.stopAndPersist({
      symbol: warning,
      text: `Skipping statement(s) in the following policies because the contain unsupported NotResource elements`,
    })
    logUnsupported(skippedStatements.notResource, relationsSpinner)
  }

  relationsSpinner.succeed("Finished setting up relations")

  const finishingSpinner = ora("Commiting work...").start()
  await transaction.commit()
  finishingSpinner.succeed("Finished commiting work.")
}
