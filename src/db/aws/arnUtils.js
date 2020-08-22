const isS3Resource = (arn) => arn.indexOf("arn:aws:s3:::") > -1;
const cypherS3ArnRegex = (s3Arn) => s3Arn.split("/")[0].replace("*", ".*");

// TODO make regex that includes arn:aws:iam::AWS-account-ID:user
const isUser = (arn) => arn.indexOf(":user") > -1;
const isAWSAccount = (arn) => arn.indexOf(":root") > -1;
const isRole = (arn) => arn.indexOf(":role") > -1;

module.exports = {
  isS3Resource,
  cypherS3ArnRegex,
  isUser,
  isRole,
  isAWSAccount,
};
