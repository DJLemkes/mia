import AWS from "aws-sdk"
import { timeAndCount, traverseAllPages } from "./utils"
import { filterUndefined } from "../../utils"

// https://docs.aws.amazon.com/glue/latest/dg/glue-specifying-resource-arns.html#non-catalog-resource-arns
export const baseArn = (region, accountId, serviceName) =>
  `arn:aws:${serviceName}:${region}:${accountId}:`

const jobArn = (jobName: string, region: string, accountId?: string): string =>
  `arn:aws:glue:${region}:${accountId}:job/${jobName}`

const databaseArn = (
  dbName: string,
  region: string,
  accountId?: string
): string => `${baseArn(region, accountId, "glue")}:database/${dbName}`

const tableArn = (
  dbName: string,
  tableName: string,
  region: string,
  accountId?: string
): string =>
  `${baseArn(region, accountId, "glue")}:table/${dbName}/${tableName}`

async function fetchGlueJobs(
  awsAccountId?: string
): Promise<(AWS.Glue.Job & { JobArn: string })[]> {
  const glue = new AWS.Glue()
  const region = glue.config.region as string

  const jobNames = await traverseAllPages(
    glue.listJobs(),
    (r) => r.JobNames || []
  )

  return Promise.all(
    jobNames.flat().map((jn) =>
      glue
        .getJob({ JobName: jn })
        .promise()
        .then((data) => ({
          ...data.Job,
          JobArn: jobArn(jn, region, awsAccountId),
        }))
    )
  ).then(filterUndefined)
}

export const timedFetchGlueJobs = timeAndCount(
  fetchGlueJobs,
  "Glue jobs",
  (r) => r.length
)

async function fetchGlueDatabases(awsAccountId?: string) {
  const glue = new AWS.Glue()
  const region = glue.config.region as string

  const databases = await traverseAllPages(
    glue.getDatabases(),
    (r) => r.DatabaseList || []
  )

  const databaseDetails = await Promise.all(
    databases.map((db) =>
      glue
        .getDatabase({ Name: db.Name })
        .promise()
        .then((data) => data.Database)
    )
  ).then(filterUndefined)

  return databaseDetails.map((dbd) => ({
    ...dbd,
    Arn: databaseArn(dbd.Name, region, awsAccountId),
  }))
}

export const timedfetchGlueDatabases = timeAndCount(
  fetchGlueDatabases,
  "Glue databases",
  (r) => r.length
)

async function fetchGlueTables(awsAccountId?: string) {
  const glue = new AWS.Glue()
  const region = glue.config.region as string

  const databases = await traverseAllPages(
    glue.getDatabases(),
    (r) => r.DatabaseList || []
  )

  return Promise.all(
    databases.map(async (db) => {
      const dbTables = await traverseAllPages(
        glue.getTables({ DatabaseName: db.Name }),
        (r) => r.TableList || []
      )
      return dbTables.map((table) => ({
        ...table,
        DatabaseName: db.Name,
        DatabaseArn: databaseArn(db.Name, region, awsAccountId),
        Arn: tableArn(db.Name, table.Name, region, awsAccountId),
      }))
    })
  ).then((data) => data.flat())
}

export const timedfetchGlueTables = timeAndCount(
  fetchGlueTables,
  "Glue tables",
  (r) => r.length
)

export default {
  timedFetchGlueJobs,
  timedfetchGlueDatabases,
  timedfetchGlueTables,
}
