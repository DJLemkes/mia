import { Transaction } from "neo4j-driver"
import { DateTime } from "neo4j-driver/lib/temporal-types"
import { NodeLabel } from "./constants"

type DbIAMPolicy = {
  Arn?: string
  PolicyName?: string
  PolicyId?: string
  CreateDate?: Date
  UpdateDate?: Date
  Description?: string
}

async function upsertPolicies(
  transaction: Transaction,
  policies: DbIAMPolicy[]
) {
  return transaction.run(
    `UNWIND $policies as p MERGE
     (:${NodeLabel.AWS_RESOURCE}:${NodeLabel.POLICY}:${NodeLabel.CUSTOMER_MANAGED_POLICY}
      {arn: p.Arn, name: p.PolicyName, id: p.PolicyId, createdAt: p.createdAt, 
       updatedAt: p.updatedAt, description: p.Description
      })`,
    {
      policies: policies.map((p) => ({
        ...p,
        createdAt: DateTime.fromStandardDate(p.CreateDate),
        updatedAt: DateTime.fromStandardDate(p.UpdateDate),
        Description: p.Description || "",
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
      `(:${NodeLabel.AWS_RESOURCE}:${NodeLabel.POLICY_VERSION} ` +
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
       :${NodeLabel.AWS_RESOURCE}:${NodeLabel.POLICY}:${NodeLabel.INLINE_POLICY} 
       {name: ip.inlinePolicyName, roleName: ip.roleName}
     )
     MERGE (:${NodeLabel.AWS_RESOURCE}:${NodeLabel.POLICY_VERSION} 
       {document: ip.PolicyDocument, isDefault: true, policyName: ip.inlinePolicyName,
        versionId: 'InlineV0', versionNumber: 0}
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
  Description?: string
}

async function upsertRoles(transaction: Transaction, roles: DbIAMRole[]) {
  return await transaction.run(
    `UNWIND $roles as r 
     MERGE (:${NodeLabel.AWS_RESOURCE}:${NodeLabel.ROLE} 
            {arn: r.Arn, name: r.RoleName, id: r.RoleId, createdAt: r.createdAt, 
             assumeRolePolicyDocument: r.assumeRolePolicyDoc, description: r.Description
            })`,
    {
      roles: roles.map((r) => ({
        ...r,
        createdAt: DateTime.fromStandardDate(r.CreateDate),
        assumeRolePolicyDoc: JSON.stringify(r.AssumeRolePolicyDocument),
        Description: r.Description || "",
      })),
    }
  )
}

type DbS3Bucket = {
  Arn: string
  Name?: string
  CreationDate?: Date
}

async function upsertBuckets(transaction: Transaction, buckets: DbS3Bucket[]) {
  return transaction.run(
    `UNWIND $buckets AS b MERGE(:${NodeLabel.AWS_RESOURCE}:${NodeLabel.BUCKET} {arn: b.Arn, name: b.Name, createdAt: b.createdAt})`,
    {
      buckets: buckets.map((b) => ({
        createdAt: DateTime.fromStandardDate(b.CreationDate),
        ...b,
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
  Description?: string
}

async function upsertLambdas(transaction: Transaction, lambdas: DbLambda[]) {
  const insertResults = await transaction.run(
    `UNWIND $lambdas as l
     MERGE (:${NodeLabel.AWS_RESOURCE}:${NodeLabel.LAMBDA}
      {name: l.FunctionName, arn: l.FunctionArn, modifiedAt: l.modifiedAt, 
       roleArn: l.Role, revisionId: l.RevisionId, description: l.Description
      })`,
    {
      lambdas: lambdas.map((l) => ({
        ...l,
        modifiedAt: l.LastModified
          ? DateTime.fromStandardDate(new Date(l.LastModified))
          : null,
        Description: l.Description || "",
      })),
    }
  )

  return insertResults
}

type DbGlueJob = {
  Name?: string
  CreatedOn?: Date
  LastModifiedOn?: Date
  JobArn: string
  Description?: string
}

async function upsertGlueJobs(transaction: Transaction, jobs: DbGlueJob[]) {
  return await transaction.run(
    `UNWIND $jobs as j 
     MERGE (:${NodeLabel.AWS_RESOURCE}:${NodeLabel.GLUE_JOB} 
      {arn: j.JobArn, name: j.Name, createdAt: j.createdAt, 
       updatedAt: j.updatedAt, roleArn: j.Role, description: j.Description
      })`,
    {
      jobs: jobs.map((j) => ({
        ...j,
        createdAt: DateTime.fromStandardDate(j.CreatedOn),
        updatedAt: DateTime.fromStandardDate(j.LastModifiedOn),
        Description: j.Description || "",
      })),
    }
  )
}

type DbGlueDatabase = {
  Name: string
  Arn: string
  CatalogId?: string
  Description?: string
  CreateTime?: Date
}

async function upsertGlueDatabases(
  transaction: Transaction,
  databases: DbGlueDatabase[]
) {
  return await transaction.run(
    `UNWIND $databases as db
     MERGE (gdb:${NodeLabel.AWS_RESOURCE}:${NodeLabel.GLUE_DATABASE} 
      {arn: db.Arn, name: db.Name, createdAt: db.createdAt})
     ON CREATE SET gdb.catalogId = db.CatalogId, gdb.description = db.Description
     ON MATCH SET gdb.catalogId = db.CatalogId, gdb.description = db.Description
      `,
    {
      databases: databases.map((db) => ({
        ...db,
        createdAt: DateTime.fromStandardDate(db.CreateTime),
      })),
    }
  )
}

type DbGlueTable = {
  Name: string
  Arn: string
  DatabaseName: string
  DatabaseArn: string
  Description?: string
  CreateTime?: Date
}

async function upsertGlueTables(
  transaction: Transaction,
  tables: DbGlueTable[]
) {
  return await transaction.run(
    `UNWIND $tables as t
     MERGE (gt:${NodeLabel.AWS_RESOURCE}:${NodeLabel.GLUE_TABLE} 
      {arn: t.Arn, name: t.Name, createdAt: t.createdAt, 
       databaseArn: t.DatabaseArn, databaseName: t.DatabaseName})
     ON CREATE SET gt.description = t.Description
     ON MATCH SET gt.description = t.Description
      `,
    {
      tables: tables.map((db) => ({
        ...db,
        createdAt: DateTime.fromStandardDate(db.CreateTime),
      })),
    }
  )
}

type DbAthenaWorkgroup = {
  Name: string
  Arn: string
  CreationTime?: Date
  State?: AWS.Athena.WorkGroupState
  Description?: string
}

async function upsertAthenaWorkgroups(
  transaction: Transaction,
  workgroups: DbAthenaWorkgroup[]
) {
  return await transaction.run(
    `UNWIND $workgroups as wg
     MERGE (awg:${NodeLabel.AWS_RESOURCE}:${NodeLabel.ATHENA_WORKGROUP} 
      {arn: wg.Arn, name: wg.Name, createdAt: wg.createdAt})
    ON CREATE SET awg.description = wg.Description, awg.state = wg.State
    ON MATCH SET awg.description = wg.Description, awg.state = wg.State
    `,
    {
      workgroups: workgroups.map((j) => ({
        ...j,
        createdAt: DateTime.fromStandardDate(j.CreationTime),
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
  upsertGlueTables,
  upsertInlineRolePolicies,
  upsertAthenaWorkgroups,
  upsertGlueDatabases,
}
