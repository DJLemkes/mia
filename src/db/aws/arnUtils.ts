import { IAMArn, Action } from "./policyDocUtils"

export const matchesResource = (serviceName: string) => (
  arn: IAMArn
): boolean => arn.service === serviceName.toLowerCase() || arn.service === "*"

export const matchesAction = (serviceName: string) => (
  action: Action
): boolean =>
  action.service === serviceName.toLowerCase() || action.service === "*"

export const cypherS3ArnRegex = (s3Arn: IAMArn): string =>
  s3Arn.fullArn.split("/")[0].replace("*", ".*")

// TODO make regex that includes arn:aws:iam::AWS-account-ID:user
export const isUser = (arn: string): boolean => arn.indexOf(":user") > -1

export const isAWSAccount = (arn: string): boolean => arn.indexOf(":root") > -1

export const isRole = (arn: string): boolean => arn.indexOf(":role") > -1
