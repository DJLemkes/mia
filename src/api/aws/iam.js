const AWS = require("aws-sdk");
const pLimit = require("p-limit");
const debug = require("debug")("aws:iam");
const url = require("url");
const { traverseAllPages, timeAndCount } = require("./utils");

async function fetchPolicies() {
  const iam = new AWS.IAM();

  return traverseAllPages(iam.listPolicies({ Scope: "Local" }), "Policies");
}

async function fetchPolicyVersions(policyArns = []) {
  const iam = new AWS.IAM();
  const listLimit = pLimit(10);
  const detailLimit = pLimit(20);

  const singlePolicyVersionListing = (arn) =>
    traverseAllPages(
      iam.listPolicyVersions({ PolicyArn: arn }),
      "Versions"
    ).then((versions) => versions.map((v) => v.VersionId));

  const versionDetails = (arn, versions) =>
    Promise.all(
      versions.map((id) =>
        detailLimit(async () =>
          iam
            .getPolicyVersion({ PolicyArn: arn, VersionId: id })
            .promise()
            .then((data) => ({
              ...data.PolicyVersion,
              Document: JSON.parse(
                decodeURIComponent(data.PolicyVersion.Document)
              ),
            }))
        )
      )
    );

  return Promise.all(
    policyArns.map((arn) =>
      listLimit(async () => {
        debug(`Listing versions for arn ${arn}`);
        const policyVersions = await singlePolicyVersionListing(arn);
        debug(`Fetching details for ${arn} and ${policyVersions}`);
        const fullPolicyVersions = await versionDetails(arn, policyVersions);
        return { Arn: arn, Versions: fullPolicyVersions };
      })
    )
  );
}

async function fetchRoles() {
  const iam = new AWS.IAM();
  const detailLimit = pLimit(20);

  //TODO: handle inline policies
  const rolesListing = await traverseAllPages(iam.listRoles(), "Roles");
  return Promise.all(
    rolesListing.map((r) =>
      detailLimit(async () => {
        return traverseAllPages(
          iam.listAttachedRolePolicies({ RoleName: r.RoleName }),
          "AttachedPolicies"
        ).then((attachedPolicies) => ({
          ...r,
          attachedPolicies,
          AssumeRolePolicyDocument: JSON.parse(
            decodeURIComponent(r.AssumeRolePolicyDocument)
          ),
        }));
      })
    )
  );
}

async function fetchInlineRolePolicies(roleNames) {
  const iam = new AWS.IAM();
  const policyNameLimit = pLimit(20);
  const policyDetailLimit = pLimit(20);

  const rolesAndInlincePolicyNames = await Promise.all(
    roleNames.map((roleName) =>
      policyNameLimit(() =>
        traverseAllPages(
          iam.listRolePolicies({ RoleName: roleName }),
          "PolicyNames"
        ).then((inlineRolePolicyNames) =>
          inlineRolePolicyNames.map((inlinePolicyName) => ({
            roleName,
            inlinePolicyName,
          }))
        )
      )
    )
  ).then((irp) => irp.flat());

  return Promise.all(
    rolesAndInlincePolicyNames.map((roleAndInlineName) =>
      policyDetailLimit(() =>
        iam
          .getRolePolicy({
            RoleName: roleAndInlineName.roleName,
            PolicyName: roleAndInlineName.inlinePolicyName,
          })
          .promise()
          .then((response) => ({
            ...roleAndInlineName,
            PolicyDocument: JSON.parse(
              decodeURIComponent(response.PolicyDocument)
            ),
          }))
      )
    )
  );
}

module.exports = {
  fetchPolicies: timeAndCount(fetchPolicies, "IAM Policies"),
  fetchRoles: timeAndCount(fetchRoles, "IAM Roles"),
  fetchPolicyVersions: timeAndCount(
    fetchPolicyVersions,
    "IAM Policy versions",
    (result) => result.reduce((acc, r) => acc + r.Versions.length, 0)
  ),
  fetchInlineRolePolicies: timeAndCount(
    fetchInlineRolePolicies,
    "IAM inline role policies"
  ),
};
