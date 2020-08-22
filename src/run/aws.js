const AWS = require("aws-sdk");
const neo4j = require("neo4j-driver");
const pLimit = require("p-limit");
const s3 = require("../api/aws/s3");
const iam = require("../api/aws/iam");
const lambda = require("../api/aws/lambda");
const glue = require("../api/aws/glue");
const dbNodes = require("../db/aws/nodes");
const dbRelations = require("../db/aws/relations");

async function run(awsCredentials, regions, dbCredentials) {
  AWS.config.credentials = awsCredentials;

  const driver = neo4j.driver(
    dbCredentials.host,
    neo4j.auth.basic(dbCredentials.user, dbCredentials.password)
  );

  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  const transaction = session.beginTransaction();

  const buckets = await s3.fetchBuckets();
  await dbNodes.upsertBuckets(transaction, buckets);

  const policies = await iam.fetchPolicies();
  await dbNodes.upsertPolicies(transaction, policies);
  const allPolicyVersions = await iam.fetchPolicyVersions(
    // policies.slice(0, 5).map((p) => p.Arn)
    policies.map((p) => p.Arn)
  );

  await Promise.all(
    allPolicyVersions.map((pv) =>
      dbNodes.upsertPolicyVersions(transaction, pv.Arn, pv.Versions)
    )
  );

  const roles = await iam.fetchRoles();
  await dbNodes.upsertRoles(transaction, roles);

  const regionLimit = pLimit(1);
  await Promise.all(
    regions.map((region) =>
      regionLimit(async () => {
        AWS.config.region = region;
        console.log(`Processing region ${AWS.config.region}...`);

        const lambdaFunctions = await lambda.fetchLambdas();
        await dbNodes.upsertLambdas(transaction, lambdaFunctions);

        const glueJobs = await glue.fetchGlueJobs();
        await dbNodes.upsertGlueJobs(transaction, glueJobs);
      })
    )
  );

  await dbRelations.setupPolicyPolicyVersionsRelations(transaction);
  await dbRelations.setupPolicyBucketRelations(transaction);
  await dbRelations.setupRolePolicyRelations(transaction, roles);
  await dbRelations.setupRoleAllowsAssumeRelations(transaction);
  await dbRelations.setupLambdaRoleRelations(transaction);
  await dbRelations.setupGlueJobRoleRelations(transaction);

  // console.log(util.inspect(insertResult, false, null, true));
  await transaction.commit();
  session.close();
  driver.close();
}

module.exports = { run };
