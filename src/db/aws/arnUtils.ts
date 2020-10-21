import { IAMArn } from "./policyDocUtils"

export const isS3Resource = (arn: IAMArn): boolean => arn.service === "s3"

export const cypherS3ArnRegex = (s3Arn: IAMArn): string =>
  s3Arn.fullArn.split("/")[0].replace("*", ".*")

// TODO make regex that includes arn:aws:iam::AWS-account-ID:user
export const isUser = (arn: string): boolean => arn.indexOf(":user") > -1

export const isAWSAccount = (arn: string): boolean => arn.indexOf(":root") > -1

export const isRole = (arn: string): boolean => arn.indexOf(":role") > -1
