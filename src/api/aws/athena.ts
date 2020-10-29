import AWS from "aws-sdk"
import { timeAndCount, traverseAllPages } from "./utils"
import { filterUndefined } from "../../utils"

// https://docs.aws.amazon.com/IAM/latest/UserGuide/list_amazonathena.html#amazonathena-resources-for-iam-policies
const workGroupArn = (
  workGroupName: string,
  region: string,
  accountId?: string
): string => `arn:aws:athena:${region}:${accountId}:workgroup/${workGroupName}`

async function fetchWorkGroups(awsAccountId?: string) {
  const athena = new AWS.Athena()
  const region = athena.config.region as string

  const workgroupSummaries = await traverseAllPages(
    athena.listWorkGroups(),
    (r) => r.WorkGroups || []
  )

  const workgroupDetails = await Promise.all(
    workgroupSummaries.map((wgs) =>
      athena
        .getWorkGroup({
          WorkGroup: wgs.Name || "",
        })
        .promise()
        .then((data) => data.WorkGroup)
    )
  ).then(filterUndefined)

  return workgroupDetails.map((wgd) => ({
    ...wgd,
    Arn: workGroupArn(wgd.Name, region, awsAccountId),
  }))
}

export const timedFetchWorkGroups = timeAndCount(
  fetchWorkGroups,
  "Athena workgroups",
  (r) => r.length
)

export default { timedFetchWorkGroups }
