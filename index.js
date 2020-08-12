const AWS = require("aws-sdk");
const s3 = require("./src/api/aws/s3");
const iam = require("./src/api/aws/iam");
const lambda = require("./src/api/aws/lambda");
const glue = require("./src/api/aws/glue");
const dbNodes = require("./src/db/aws/nodes");
const dbRelations = require("./src/db/aws/relations");
const neo4j = require("neo4j-driver");
const util = require("util");

(async () => {
  const driver = neo4j.driver(
    "neo4j://localhost",
    neo4j.auth.basic("neo4j", "nff")
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

  await dbRelations.setupPolicyPolicyVersionsRelations(transaction);
  await dbRelations.setupPolicyBucketRelations(transaction);

  const roles = await iam.fetchRoles();
  await dbNodes.upsertRoles(transaction, roles);
  await dbRelations.setupRolePolicyRelations(transaction, roles);
  await dbRelations.setupRoleAllowsAssumeRelations(transaction);

  const lambdaFunctions = await lambda.fetchLambdas();
  await dbNodes.upsertLambdas(transaction, lambdaFunctions);
  await dbRelations.setupLambdaRoleRelations(transaction);

  const glueJobs = await glue.fetchGlueJobs();
  await dbNodes.upsertGlueJobs(transaction, glueJobs);
  await dbRelations.setupGlueJobRoleRelations(transaction);

  // console.log(util.inspect(insertResult, false, null, true));
  await transaction.commit();
  session.close();
  driver.close();
  process.exit(0);
})().catch((e) => {
  console.log(`Error: ${e}`);
  process.exit(1);
});
