import AWS from "aws-sdk"
import { timeAndCount, traverseAllPages } from "./utils"
import { filterUndefined } from "../../utils"
import { String } from "aws-sdk/clients/apigateway"

// https://docs.aws.amazon.com/glue/latest/dg/glue-specifying-resource-arns.html#non-catalog-resource-arns
const jobArn = (jobName: string, region: string, accountId?: string): string =>
  `arn:aws:glue:${region}:${accountId}:job/${jobName}`

async function fetchGlueJobs(
  awsAccountId?: string
): Promise<(AWS.Glue.Job & { JobArn: String })[]> {
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

export default { timedFetchGlueJobs }
