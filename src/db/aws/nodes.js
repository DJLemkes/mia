const { DateTime } = require("neo4j-driver/lib/temporal-types");
const nodeLabels = require("./constants").nodeLabels;

async function upsertBuckets(transaction, buckets) {
  buckets.forEach((b) => {
    b.createdAt = DateTime.fromStandardDate(b.CreationDate);
  });
  return transaction.run(
    `UNWIND $buckets AS b MERGE(:${nodeLabels.AWS_RESOURCE}:${nodeLabels.BUCKET} {arn: b.Arn, name: b.Name, createdAt: b.createdAt})`,
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
      `(:${nodeLabels.AWS_RESOURCE}:${nodeLabels.POLICY}:${nodeLabels.CUSTOMER_MANAGED_POLICY} ` +
      "{arn: p.Arn, name: p.PolicyName, id: p.PolicyId, createdAt: p.createdAt, updatedAt: p.updatedAt})",
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
      `(:${nodeLabels.AWS_RESOURCE}:${nodeLabels.POLICY_VERSION} ` +
      "{document: pv.document, policyArn: $policyArn, versionId: pv.VersionId, " +
      "versionNumber: pv.versionNumber, isDefault: pv.IsDefaultVersion, " +
      "createdAt: pv.createdAt})",
    { policyVersions, policyArn }
  );
}

async function upsertInlineRolePolicies(transaction, inlinePolicies) {
  inlinePolicies.forEach((ip) => {
    ip.PolicyDocument = JSON.stringify(ip.PolicyDocument);
  });
  return await transaction.run(
    `UNWIND $inlinePolicies as ip
     MERGE (
       :${nodeLabels.AWS_RESOURCE}:${nodeLabels.POLICY}:${nodeLabels.INLINE_POLICY} 
       {name: ip.inlinePolicyName, roleName: ip.roleName}
     )
     MERGE (:${nodeLabels.AWS_RESOURCE}:${nodeLabels.POLICY_VERSION} 
       {document: ip.PolicyDocument, isDefault: true, policyName: ip.inlinePolicyName}
     )
    `,
    { inlinePolicies }
  );
}

async function upsertRoles(transaction, roles) {
  roles.forEach((r) => {
    r.createdAt = DateTime.fromStandardDate(r.CreateDate);
    r.assumeRolePolicyDoc = JSON.stringify(r.AssumeRolePolicyDocument);
  });
  return await transaction.run(
    "UNWIND $roles as r " +
      `MERGE (:${nodeLabels.AWS_RESOURCE}:${nodeLabels.ROLE} {arn: r.Arn, name: r.RoleName, id: r.RoleId, ` +
      "createdAt: r.createdAt, assumeRolePolicyDocument: r.assumeRolePolicyDoc})",
    {
      roles,
    }
  );
}

async function upsertLambdas(transaction, lambdas) {
  lambdas.forEach((l) => {
    l.modifiedAt = DateTime.fromStandardDate(new Date(l.LastModified));
  });

  const insertResults = await transaction.run(
    "UNWIND $lambdas as l " +
      `MERGE (:${nodeLabels.AWS_RESOURCE}:${nodeLabels.LAMBDA} ` +
      "{name: l.FunctionName, arn: l.FunctionArn, modifiedAt: l.modifiedAt, roleArn: l.Role, revisionId: l.RevisionId})",
    { lambdas }
  );

  return insertResults;
}

async function upsertGlueJobs(transaction, jobs) {
  jobs.forEach((j) => {
    j.createdAt = DateTime.fromStandardDate(j.CreatedOn);
    j.updatedAt = DateTime.fromStandardDate(j.LastModifiedOn);
  });
  return await transaction.run(
    "UNWIND $jobs as j " +
      `MERGE (:${nodeLabels.AWS_RESOURCE}:${nodeLabels.GLUE_JOB} {name: j.Name, createdAt: j.createdAt, updatedAt: j.updatedAt, roleArn: j.Role})`,
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
  upsertInlineRolePolicies,
};
