import { Transaction } from "neo4j-driver"
import { DateTime } from "neo4j-driver/lib/temporal-types"
import { nodeLabels } from "./constants"

type DbS3Bucket = {
  Arn: string
  Name?: string
  CreationDate?: Date
}

async function upsertBuckets(transaction: Transaction, buckets: DbS3Bucket[]) {
  return transaction.run(
    `UNWIND $buckets AS b MERGE(:${nodeLabels.AWS_RESOURCE}:${nodeLabels.BUCKET} {arn: b.Arn, name: b.Name, createdAt: b.createdAt})`,
    {
      buckets: buckets.map((b) => ({
        createdAt: DateTime.fromStandardDate(b.CreationDate),
        ...b,
      })),
    }
  )
}

type DbIAMPolicy = {
  Arn?: string
  PolicyName?: string
  PolicyId?: string
  CreateDate?: Date
  UpdateDate?: Date
}

async function upsertPolicies(
  transaction: Transaction,
  policies: DbIAMPolicy[]
) {
  return transaction.run(
    "UNWIND $policies as p MERGE " +
      `(:${nodeLabels.AWS_RESOURCE}:${nodeLabels.POLICY}:${nodeLabels.CUSTOMER_MANAGED_POLICY} ` +
      "{arn: p.Arn, name: p.PolicyName, id: p.PolicyId, createdAt: p.createdAt, updatedAt: p.updatedAt})",
    {
      policies: policies.map((p) => ({
        createdAt: DateTime.fromStandardDate(p.CreateDate),
        updatedAt: DateTime.fromStandardDate(p.UpdateDate),
        ...p,
      })),
    }
  )
}

type DbIAMPolicyVersion = {
  VersionId?: string
  Document: Object
  CreateDate?: Date
  IsDefaultVersion?: boolean
}

async function upsertPolicyVersions(
  transaction: Transaction,
  policyArn: string,
  policyVersions: DbIAMPolicyVersion[]
) {
  return transaction.run(
    "UNWIND $policyVersions as pv MERGE " +
      `(:${nodeLabels.AWS_RESOURCE}:${nodeLabels.POLICY_VERSION} ` +
      "{document: pv.document, policyArn: $policyArn, versionId: pv.VersionId, " +
      "versionNumber: pv.versionNumber, isDefault: pv.IsDefaultVersion, " +
      "createdAt: pv.createdAt})",
    {
      policyVersions: policyVersions.map((pv) => ({
        createdAt: DateTime.fromStandardDate(pv.CreateDate),
        document: JSON.stringify(pv.Document),
        versionNumber: parseInt(
          (pv.VersionId || "").toLowerCase().replace("v", "")
        ),
        ...pv,
      })),
      policyArn,
    }
  )
}

type DbIAMInlineRolePolicy = {
  PolicyDocument: Object
  inlinePolicyName: string
  roleName: string
}

async function upsertInlineRolePolicies(
  transaction: Transaction,
  inlinePolicies: DbIAMInlineRolePolicy[]
) {
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
    {
      inlinePolicies: inlinePolicies.map((ip) => ({
        ...ip,
        PolicyDocument: JSON.stringify(ip.PolicyDocument),
      })),
    }
  )
}

type DbIAMRole = {
  RoleName: string
  RoleId: string
  CreateDate: Date
  AssumeRolePolicyDocument: Object
}

async function upsertRoles(transaction: Transaction, roles: DbIAMRole[]) {
  return await transaction.run(
    "UNWIND $roles as r " +
      `MERGE (:${nodeLabels.AWS_RESOURCE}:${nodeLabels.ROLE} {arn: r.Arn, name: r.RoleName, id: r.RoleId, ` +
      "createdAt: r.createdAt, assumeRolePolicyDocument: r.assumeRolePolicyDoc})",
    {
      roles: roles.map((r) => ({
        createdAt: DateTime.fromStandardDate(r.CreateDate),
        assumeRolePolicyDoc: JSON.stringify(r.AssumeRolePolicyDocument),
        ...r,
      })),
    }
  )
}

type DbLambda = {
  FunctionName?: string
  FunctionArn?: string
  LastModified?: string
  Role?: string
  RevisionId?: string
}

async function upsertLambdas(transaction: Transaction, lambdas: DbLambda[]) {
  const insertResults = await transaction.run(
    "UNWIND $lambdas as l " +
      `MERGE (:${nodeLabels.AWS_RESOURCE}:${nodeLabels.LAMBDA} ` +
      "{name: l.FunctionName, arn: l.FunctionArn, modifiedAt: l.modifiedAt, roleArn: l.Role, revisionId: l.RevisionId})",
    {
      lambdas: lambdas.map((l) => ({
        modifiedAt: l.LastModified
          ? DateTime.fromStandardDate(new Date(l.LastModified))
          : null,
        ...l,
      })),
    }
  )

  return insertResults
}

type DbGlueJob = {
  Name?: string
  CreatedOn?: Date
  LastModifiedOn?: Date
}

async function upsertGlueJobs(transaction: Transaction, jobs: DbGlueJob[]) {
  return await transaction.run(
    "UNWIND $jobs as j " +
      `MERGE (:${nodeLabels.AWS_RESOURCE}:${nodeLabels.GLUE_JOB} {name: j.Name, createdAt: j.createdAt, updatedAt: j.updatedAt, roleArn: j.Role})`,
    {
      jobs: jobs.map((j) => ({
        createdAt: DateTime.fromStandardDate(j.CreatedOn),
        updatedAt: DateTime.fromStandardDate(j.LastModifiedOn),
        ...j,
      })),
    }
  )
}

export default {
  upsertBuckets,
  upsertPolicies,
  upsertPolicyVersions,
  upsertLambdas,
  upsertRoles,
  upsertGlueJobs,
  upsertInlineRolePolicies,
}
