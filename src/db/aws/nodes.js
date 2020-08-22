const { DateTime } = require("neo4j-driver/lib/temporal-types");

async function upsertBuckets(transaction, buckets) {
  buckets.forEach((b) => {
    b.createdAt = DateTime.fromStandardDate(b.CreationDate);
  });
  return transaction.run(
    `UNWIND $buckets AS b MERGE(:Bucket {arn: b.Arn, name: b.Name, createdAt: b.createdAt})`,
    { buckets }
  );
}

async function upsertPolicies(transaction, policies) {
  policies.forEach((p) => {
    p.createdAt = DateTime.fromStandardDate(p.CreateDate);
    p.updatedAt = DateTime.fromStandardDate(p.UpdateDate);
  });
  return transaction.run(
    "UNWIND $policies as p MERGE " +
      "(:Policy {arn: p.Arn, name: p.PolicyName, id: p.PolicyId, createdAt: p.createdAt, updatedAt: p.updatedAt})",
    { policies }
  );
}

async function upsertPolicyVersions(transaction, policyArn, policyVersions) {
  policyVersions.forEach((pv) => {
    pv.createdAt = DateTime.fromStandardDate(pv.CreateDate);
    pv.document = JSON.stringify(pv.Document);
    pv.versionNumber = parseInt(pv.VersionId.toLowerCase().replace("v", ""));
  });
  return transaction.run(
    "UNWIND $policyVersions as pv MERGE " +
      "(:PolicyVersion " +
      "{document: pv.document, policyArn: $policyArn, versionId: pv.VersionId, " +
      "versionNumber: pv.versionNumber, isDefault: pv.IsDefaultVersion, " +
      "createdAt: pv.createdAt})",
    { policyVersions, policyArn }
  );
}

async function upsertLambdas(transaction, lambdas) {
  lambdas.forEach((l) => {
    l.modifiedAt = DateTime.fromStandardDate(new Date(l.LastModified));
  });

  const insertResults = await transaction.run(
    "UNWIND $lambdas as l " +
      "MERGE (:Lambda {name: l.FunctionName, arn: l.FunctionArn, modifiedAt: l.modifiedAt, roleArn: l.Role, revisionId: l.RevisionId})",
    { lambdas }
  );

  return insertResults;
}

async function upsertRoles(transaction, roles) {
  roles.forEach((r) => {
    r.createdAt = DateTime.fromStandardDate(r.CreateDate);
    r.assumeRolePolicyDoc = JSON.stringify(r.AssumeRolePolicyDocument);
  });
  return await transaction.run(
    "UNWIND $roles as r " +
      "MERGE (:Role {arn: r.Arn, name: r.RoleName, id: r.RoleId, " +
      "createdAt: r.createdAt, assumeRolePolicyDocument: r.assumeRolePolicyDoc})",
    {
      roles,
    }
  );
}

async function upsertGlueJobs(transaction, jobs) {
  jobs.forEach((j) => {
    j.createdAt = DateTime.fromStandardDate(j.CreatedOn);
    j.updatedAt = DateTime.fromStandardDate(j.LastModifiedOn);
  });
  return await transaction.run(
    "UNWIND $jobs as j " +
      "MERGE (:GlueJob {name: j.Name, createdAt: j.createdAt, updatedAt: j.updatedAt, roleArn: j.Role})",
    { jobs }
  );
}

module.exports = {
  upsertBuckets,
  upsertPolicies,
  upsertPolicyVersions,
  upsertLambdas,
  upsertRoles,
  upsertGlueJobs,
};
