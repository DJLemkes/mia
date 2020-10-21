import AWS from "aws-sdk"
import { timeAndCount } from "./utils"
import debug from "debug"

const debugLog = debug("aws:s3")

export type S3BucketInfo = AWS.S3.Bucket & { Arn: string }

const bucketArn = (bucketName: string): string => `arn:aws:s3:::${bucketName}`

async function plainFetchBuckets(): Promise<S3BucketInfo[]> {
  const s3 = new AWS.S3()
  const response = await s3.listBuckets().promise()

  return (response.Buckets || []).reduce((acc, bucketInfo) => {
    if (bucketInfo.Name) {
      return acc.concat({
        ...bucketInfo,
        Arn: bucketArn(bucketInfo.Name),
      })
    } else {
      debugLog(`Bucket ${bucketInfo} has no Name attribute`)
      return acc
    }
  }, <S3BucketInfo[]>[])
}

export const fetchBuckets = timeAndCount(
  plainFetchBuckets,
  "S3 Buckets",
  (r) => r.length
)

export default {
  fetchBuckets,
}
