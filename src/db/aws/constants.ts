export enum NodeLabel {
  AWS_ACCOUNT = "AWSAccount",
  AWS_RESOURCE = "AWSResource",
  AWS_SERVICE = "AWSService",
  AWS_USER = "AWSUser",
  GLUE_JOB = "AWSGlueJob",
  GLUE_DATABASE = "AWSGlueDatabase",
  GLUE_TABLE = "AWSGlueTable",
  LAMBDA = "AWSLambda",
  BUCKET = "AWSBucket",
  ROLE = "AWSRole",
  POLICY = "AWSPolicy",
  INLINE_POLICY = "AWSInlinePolicy",
  AWS_MANAGED_POLICY = "AWSManagedPolicy",
  CUSTOMER_MANAGED_POLICY = "AWSCustomerManagedPolicy",
  POLICY_VERSION = "AWSPolicyVersion",
  ATHENA_WORKGROUP = "AWSAthenaWorkgroup",
}

export enum RelationLabel {
  HAS = "HAS",
  HAS_PERMISSION = "HAS_PERMISSION",
  HAS_NO_PERMISSION = "HAS_NO_PERMISSION",
  CAN_ASSUME = "CAN_ASSUME",
}
