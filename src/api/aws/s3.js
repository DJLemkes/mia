const AWS = require("aws-sdk");
const timeAndCount = require("./utils").timeAndCount;

const bucketArn = (bucketName) => `arn:aws:s3:::${bucketName}`;

const fetchBuckets = async () => {
  const s3 = new AWS.S3();
  const response = await s3.listBuckets().promise();
  return response.Buckets.map((bucketInfo) => ({
    ...bucketInfo,
    Arn: bucketArn(bucketInfo.Name),
  }));
};

module.exports = { fetchBuckets: timeAndCount(fetchBuckets, "S3 Buckets") };
