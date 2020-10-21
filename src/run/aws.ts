import AWS from "aws-sdk"
import neo4j from "neo4j-driver"
import ora from "ora"
import pLimit from "p-limit"
import s3 from "../api/aws/s3"
import iam from "../api/aws/iam"
import lambda from "../api/aws/lambda"
import glue from "../api/aws/glue"
import dbNodes from "../db/aws/nodes"
import dbRelations from "../db/aws/relations"
import { filterUndefined } from "../utils"

export async function run(awsCredentials, regions, dbCredentials) {
  AWS.config.credentials = awsCredentials

  const driver = neo4j.driver(
    dbCredentials.host,
    neo4j.auth.basic(dbCredentials.user, dbCredentials.password)
  )

  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE })
  // We are not able to handle updates correctly yet so we first wipe everything.
  await session.run("MATCH (a) DETACH DELETE a")
  const transaction = session.beginTransaction()

  const roles = await iam.timedFetchRoles()
  await dbNodes.upsertRoles(transaction, roles)

  const inlineRolePolicies = await iam.timedFetchInlineRolePolicies(
    roles.map((r) => r.RoleName)
  )
  await dbNodes.upsertInlineRolePolicies(transaction, inlineRolePolicies)

  const policies = await iam.timedFetchPolicies()
  await dbNodes.upsertPolicies(transaction, policies)
  const allPolicyVersions = await iam.timedFetchPolicyVersions(
    // policies.slice(0, 5).map((p) => p.Arn)
    filterUndefined(policies.map((p) => p.Arn))
  )

  await Promise.all(
    allPolicyVersions.map((pv) =>
      dbNodes.upsertPolicyVersions(transaction, pv.Arn, pv.Versions)
    )
  )

  const buckets = await s3.fetchBuckets()
  await dbNodes.upsertBuckets(transaction, buckets)

  const regionLimit = pLimit(1)
  await Promise.all(
    regions.map((region) =>
      regionLimit(async () => {
        AWS.config.region = region
        console.log(`Processing region ${AWS.config.region}...`)

        const lambdaFunctions = await lambda.timedFetchLambdas()
        await dbNodes.upsertLambdas(transaction, lambdaFunctions)

        const glueJobs = await glue.timedFetchGlueJobs()
        await dbNodes.upsertGlueJobs(transaction, glueJobs)
      })
    )
  )

  const relationsSpinner = ora("Setting up relations...").start()
  await dbRelations.setupRolePolicyRelations(transaction, roles)
  await dbRelations.setupPolicyPolicyVersionsRelations(transaction)
  await dbRelations.setupPolicyBucketRelations(transaction)
  await dbRelations.setupRoleAllowsAssumeRelations(transaction)
  await dbRelations.setupLambdaRoleRelations(transaction)
  await dbRelations.setupGlueJobRoleRelations(transaction)
  relationsSpinner.succeed("Finished setting up relations")

  const finishingSpinner = ora("Commiting work...").start()
  await transaction.commit()
  session.close()
  driver.close()
  finishingSpinner.succeed("Finished commiting work.")
}
