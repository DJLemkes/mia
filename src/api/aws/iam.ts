import AWS from "aws-sdk"
import pLimit from "p-limit"
import { traverseAllPages, timeAndCount } from "./utils"
import { filterUndefined } from "../../utils"
import debug from "debug"

const debugLog = debug("aws:iam")

const parsePolicyDoc = (uriEncodedPolicyDoc: string | undefined): Object =>
  uriEncodedPolicyDoc ? JSON.parse(decodeURIComponent(uriEncodedPolicyDoc)) : {}

async function fetchPolicies(): Promise<AWS.IAM.Policy[]> {
  const iam = new AWS.IAM()

  return traverseAllPages(
    iam.listPolicies({ Scope: "Local" }),
    (r) => r.Policies || []
  )
}

export const timedFetchPolicies = timeAndCount(
  fetchPolicies,
  "IAM Policies",
  (r) => r.length
)

async function fetchPolicyVersions(policyArns: string[] = []) {
  const iam = new AWS.IAM()
  const listLimit = pLimit(10)
  const detailLimit = pLimit(20)

  const singlePolicyVersionListing = (arn: string) =>
    traverseAllPages(
      iam.listPolicyVersions({ PolicyArn: arn }),
      (r) => r.Versions || []
    )
      .then((versions) => versions.map((v) => v.VersionId))
      .then(filterUndefined)

  const versionDetails = (arn: string, versions: string[]) =>
    Promise.all(
      versions.map((versionId) =>
        detailLimit(async () =>
          iam
            .getPolicyVersion({ PolicyArn: arn, VersionId: versionId })
            .promise()
            .then((data) => ({
              ...data.PolicyVersion,
              Document: parsePolicyDoc(data.PolicyVersion?.Document),
            }))
        )
      )
    )

  return Promise.all(
    policyArns.map((arn) =>
      listLimit(async () => {
        debugLog(`Listing versions for arn ${arn}`)
        const policyVersions = await singlePolicyVersionListing(arn)
        debugLog(`Fetching details for ${arn} and ${policyVersions}`)
        const fullPolicyVersions = await versionDetails(arn, policyVersions)
        return { Arn: arn, Versions: fullPolicyVersions }
      })
    )
  )
}

export const timedFetchPolicyVersions = timeAndCount(
  fetchPolicyVersions,
  "IAM Policy versions",
  (result) => result.reduce((acc, r) => acc + r.Versions.length, 0)
)

async function fetchRoles() {
  const iam = new AWS.IAM()
  const detailLimit = pLimit(20)

  const rolesListing = await traverseAllPages(iam.listRoles(), (r) => r.Roles)
  return Promise.all(
    rolesListing.map((r) =>
      detailLimit(async () => {
        return traverseAllPages(
          iam.listAttachedRolePolicies({ RoleName: r.RoleName }),
          (r) => r.AttachedPolicies || []
        ).then((attachedPolicies) => ({
          ...r,
          attachedPolicies,
          AssumeRolePolicyDocument: parsePolicyDoc(r.AssumeRolePolicyDocument),
        }))
      })
    )
  )
}

export const timedFetchRoles = timeAndCount(
  fetchRoles,
  "IAM Roles",
  (r) => r.length
)

async function fetchInlineRolePolicies(roleNames?: string[]) {
  const iam = new AWS.IAM()
  const policyNameLimit = pLimit(20)
  const policyDetailLimit = pLimit(20)

  const rolesAndInlincePolicyNames = await Promise.all(
    (roleNames || []).map((roleName) =>
      policyNameLimit(() =>
        traverseAllPages(
          iam.listRolePolicies({ RoleName: roleName }),
          (r) => r.PolicyNames
        ).then((inlineRolePolicyNames) =>
          inlineRolePolicyNames.map((inlinePolicyName) => ({
            roleName,
            inlinePolicyName,
          }))
        )
      )
    )
  ).then((irp) => irp.flat())

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
            PolicyDocument: parsePolicyDoc(response.PolicyDocument),
          }))
      )
    )
  )
}

export const timedFetchInlineRolePolicies = timeAndCount(
  fetchInlineRolePolicies,
  "IAM inline role policies",
  (r) => r.length
)

export default {
  timedFetchPolicies,
  timedFetchRoles,
  timedFetchPolicyVersions,
  timedFetchInlineRolePolicies,
}
