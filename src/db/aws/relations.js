const { isS3Resource, cypherS3ArnRegex } = require("./arnUtils");
const {
  allowedServices,
  allowedAWSAccounts,
  allowedUsers,
  allowedAWSRoles,
} = require("./policyDocUtils");

const cypherActionRegex = (awsAction) => awsAction.replace("*", ".*");

async function setupPolicyPolicyVersionsRelations(transaction) {
  return transaction.run(
    `MATCH (pv:PolicyVersion)
       MATCH (p:Policy)
       WHERE p.arn = pv.policyArn
       MERGE (p)-[:HAS]->(pv)`
  );
}

// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_resource.html
async function setupPolicyBucketRelations(transaction) {
  const policyVersions = await transaction.run(
    "MATCH (pv:PolicyVersion) RETURN pv.versionId AS versionId, pv.policyArn AS policyArn, pv.document AS document"
  );
  // WHERE pv.isDefault = true

  const statementsToProcess = policyVersions.records.flatMap((r) => {
    const policyDoc = JSON.parse(r.get("document"));
    const policyArn = r.get("policyArn");
    const docVersion = r.get("versionId");

    const s3BucketStatements = policyDoc.Statement.reduce((acc, s) => {
      if (typeof s.Resource === "string" && isS3Resource(s.Resource)) {
        actions = [s.Action].flat().map((a) => ({
          action: a,
          regexAction: cypherActionRegex(a),
        }));
        return acc.concat({
          ...s,
          actions,
          policyArn,
          resourceArnRegex: cypherS3ArnRegex(s.Resource),
          policyDocumentVersionId: docVersion,
        });
      } else if (Array.isArray(s.Resource)) {
        const perResourceStatements = s.Resource.filter(isS3Resource).map(
          (r) => {
            actions = [s.Action].flat().map((a) => ({
              action: a,
              regexAction: cypherActionRegex(a),
            }));
            return {
              ...s,
              actions,
              Resource: r,
              policyArn,
              resourceArnRegex: cypherS3ArnRegex(r),
              policyDocumentVersionId: docVersion,
            };
          }
        );
        return acc.concat(perResourceStatements);
      } else {
        return acc;
      }
    }, []);

    return s3BucketStatements;
  });

  const linkResults = await Promise.all(
    statementsToProcess.map((ptp) =>
      transaction.run(
        `
            MATCH (b:Bucket) WHERE b.arn =~ $resourceArnRegex
            MATCH (pv:PolicyVersion) WHERE pv.versionId = $policyDocumentVersionId AND pv.policyArn = $policyArn
            UNWIND $actions as a MERGE (pv)-[:HAS_PERMISSION {action: a.action, regexAction: a.regexAction}]-(b)
            `,
        ptp
      )
    )
  );
}

async function setupLambdaRoleRelations(transaction) {
  return await transaction.run(
    `
      MATCH (l:Lambda) 
      MATCH (r:Role) WHERE r.arn = l.roleArn
      MERGE (l)-[:HAS]->(r)
      `
  );
}

async function setupRolePolicyRelations(transaction, roleAndPolicies) {
  insertResults = await Promise.all(
    roleAndPolicies.flatMap((role) => {
      return Promise.all(
        role.attachedPolicies.map((ap) =>
          transaction.run(
            `
              MATCH (r:Role) WHERE r.arn = $roleArn
              MATCH (p:Policy) WHERE p.arn = $policyArn
              MERGE (r)-[:HAS]->(p)
              `,
            { roleArn: role.Arn, policyArn: ap.PolicyArn }
          )
        )
      );
    })
  );

  return insertResults;
}

async function setupGlueJobRoleRelations(transaction) {
  return transaction.run(
    `
      MATCH (gj:GlueJob) 
      MATCH (r:Role) WHERE r.arn = gj.roleArn
      MERGE (gj)-[:HAS]->(r)
      `
  );
}

async function setupRoleAllowsAssumeRelations(transaction) {
  const roles = await transaction.run(
    "MATCH (r:Role) WHERE r.assumeRolePolicyDocument <> '' RETURN r.arn AS arn, r.assumeRolePolicyDocument as doc"
  );

  const rolesToProcess = roles.records.reduce((acc, r) => {
    const roleArn = r.get("arn");
    const assumeRoleDoc = { Statement: [], ...JSON.parse(r.get("doc")) };

    return acc.concat({
      services: allowedServices(assumeRoleDoc, roleArn),
      users: allowedUsers(assumeRoleDoc, roleArn),
      roles: allowedAWSRoles(assumeRoleDoc, roleArn),
      accounts: allowedAWSAccounts(assumeRoleDoc, roleArn),
    });
  }, []);

  const uniquePrincipals = (rolesToProcess, key) =>
    new Set(
      rolesToProcess
        .reduce(
          (acc, rtp) => acc.concat(rtp[key].map((s) => s.allowedAssume)),
          []
        )
        .flat()
    );

  await transaction.run(
    `
    UNWIND $services as s MERGE (:AWSService {awsName: s})
    WITH 1 AS one
    UNWIND $accounts as a MERGE (:AWSAccount {arn: a})
    WITH 2 AS two
    UNWIND $users as u MERGE (:AWSUser {arn: u})
    `,
    {
      services: uniquePrincipals(rolesToProcess, "services"),
      accounts: uniquePrincipals(rolesToProcess, "accounts"),
      users: uniquePrincipals(rolesToProcess, "users"),
    }
  );

  const serviceLink = (roleArn, serviceName) =>
    transaction.run(
      `
      MATCH (s:AWSService {awsName: $serviceName})
      MATCH (r:Role) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, serviceName }
    );

  const accountLink = (roleArn, accountArn) =>
    transaction.run(
      `
      MATCH (s:AWSAccount {arn: $accountArn})
      MATCH (r:Role) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, accountArn }
    );

  const userLink = (roleArn, userArn) =>
    transaction.run(
      `
      MATCH (s:AWSUser {arn: $userArn})
      MATCH (r:Role) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, userArn }
    );

  const roleLink = (roleArn, sourceRoleArn) =>
    transaction.run(
      `
      MATCH (s:Role {arn: $sourceRoleArn})
      MATCH (r:Role) WHERE r.arn = $roleArn
      MERGE (s)-[:CAN_ASSUME]->(r)
      `,
      { roleArn, sourceRoleArn }
    );

  const allLinks = rolesToProcess
    .reduce((acc, rtp) => {
      const serviceLinks = rtp.services.map((s) =>
        serviceLink(s.roleArn, s.allowedAssume)
      );
      const accountLinks = rtp.accounts.map((a) =>
        accountLink(a.roleArn, a.allowedAssume)
      );
      const userLinks = rtp.users.map((u) =>
        userLink(u.roleArn, u.allowedAssume)
      );
      const roleLinks = rtp.roles.map((r) =>
        roleLink(r.roleArn, r.allowedAssume)
      );

      return acc.concat(serviceLinks, accountLinks, userLinks, roleLinks);
    }, [])
    .flat();

  return Promise.all(allLinks);
}

module.exports = {
  setupPolicyPolicyVersionsRelations,
  setupPolicyBucketRelations,
  setupLambdaRoleRelations,
  setupRolePolicyRelations,
  setupGlueJobRoleRelations,
  setupRoleAllowsAssumeRelations,
};
