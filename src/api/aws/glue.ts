import AWS from "aws-sdk"
import { timeAndCount, traverseAllPages } from "./utils"
import { filterUndefined } from "../../utils"

async function fetchGlueJobs(): Promise<AWS.Glue.Job[]> {
  const glue = new AWS.Glue()

  const jobNames = await traverseAllPages(
    glue.listJobs(),
    (r) => r.JobNames || []
  )

  return Promise.all(
    jobNames.flat().map((jn) =>
      glue
        .getJob({ JobName: jn })
        .promise()
        .then((data) => data.Job)
    )
  ).then(filterUndefined)
}

export const timedFetchGlueJobs = timeAndCount(
  fetchGlueJobs,
  "Glue jobs",
  (r) => r.length
)

export default { timedFetchGlueJobs }
