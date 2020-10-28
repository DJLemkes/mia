import { isUser, isAWSAccount, isRole } from "./arnUtils"
import * as t from "io-ts"
import { withFallback } from "io-ts-types/lib/withFallback"

// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_grammar.html
const IAMArray = <C extends t.Mixed>(codec: C) =>
  new t.Type<t.TypeOf<C>[], t.TypeOf<C>[], unknown>(
    "IAMArray",
    (input: unknown): input is t.TypeOf<C>[] =>
      typeof input === "string" || Array.isArray(input) || input === undefined,
    (input: unknown, context: t.Context) =>
      typeof input === "string"
        ? t.array(codec).decode([input])
        : Array.isArray(input)
        ? t.array(codec).decode(input)
        : input === undefined
        ? t.array(codec).decode([])
        : t.failure(
            input,
            context,
            "Could not decode an action from provided input"
          ),
    t.identity
  )

type IAMArnType = {
  readonly partition: string
  readonly service: string
  readonly region: string
  readonly account: string
  readonly resource: string
  readonly fullArn: string
}

const IAMArn = new t.Type<IAMArnType, IAMArnType, unknown>(
  "IAMArn",
  (input: unknown): input is IAMArnType => typeof input === "string",
  (input: unknown, context: t.Context) => {
    try {
      const splitted =
        input === "*"
          ? ["", "*", "*", "*", "*", "*"]
          : (input as string).split(":")
      const [, partition, service, region, account, resource] = splitted
      return t.success({
        partition,
        service,
        region,
        account,
        resource,
        fullArn: input as string,
      })
    } catch (e) {
      return t.failure(input, context, `Could not decode arn: ${e}`)
    }
  },
  t.identity
)

export type IAMArn = t.TypeOf<typeof IAMArn>

type IAMActionType = {
  readonly service: string
  readonly action: string
  readonly fullAction: string
}

const Action = new t.Type<IAMActionType, IAMActionType, unknown>(
  "Action",
  (input: unknown): input is IAMActionType =>
    typeof input === "string" && input.split(":").length === 2,
  (input: unknown, context: t.Context) => {
    try {
      const [service, action] = (input as string).split(":")
      return t.success({
        service,
        action,
        fullAction: input as string,
      })
    } catch (e) {
      return t.failure(input, context, `Could not decode action: ${e}`)
    }
  },
  t.identity
)

export type Action = t.TypeOf<typeof Action>

const Principal = t.type({
  Service: IAMArray(t.string),
  AWS: IAMArray(t.string),
})

export type Principal = t.TypeOf<typeof Principal>

const Effect = t.union([t.literal("Allow"), t.literal("Deny")])

export type Effect = t.TypeOf<typeof Effect>

const PolicyStatement = t.type(
  {
    Effect: t.readonly(Effect),
    Resource: IAMArray(IAMArn),
    NotResource: IAMArray(IAMArn),
    Action: IAMArray(Action),
    NotAction: IAMArray(Action),
    Principal: withFallback(Principal, { Service: [], AWS: [] }),
  },
  "PolicyStatement"
)

export type PolicyStatement = t.TypeOf<typeof PolicyStatement>

const Version = t.union([t.literal("2012-10-17"), t.literal("2008-10-17")])

export type Version = t.TypeOf<typeof Version>

export const PolicyDoc = t.type({
  Version: t.readonly(Version),
  Statement: IAMArray(PolicyStatement),
})

export type PolicyDoc = t.TypeOf<typeof PolicyDoc>

export const allowedPrincipals = (
  accessor: (principal: Principal) => string[]
) => (assumeRolePolicyDoc: PolicyDoc, roleArn: string) =>
  assumeRolePolicyDoc.Statement.reduce(
    (acc: { roleArn: string; allowedAssume: string }[], s: PolicyStatement) => {
      if (
        s.Effect === "Allow" &&
        s.Action.find((a) => a.service === "sts" && a.action === "AssumeRole")
      ) {
        const allowedAssume = accessor(s.Principal).map((principal) => ({
          roleArn,
          allowedAssume: principal,
        }))
        return acc.concat(allowedAssume)
      } else {
        return acc
      }
    },
    []
  )

export const allowedServices = allowedPrincipals((p) => p.Service)

const allowedARNs = allowedPrincipals((p) => p.AWS)

export const allowedAWSAccounts = (
  assumeRolePolicyDoc: PolicyDoc,
  roleArn: string
) =>
  allowedARNs(assumeRolePolicyDoc, roleArn).filter((elem) =>
    isAWSAccount(elem.allowedAssume)
  )

export const allowedAWSRoles = (
  assumeRolePolicyDoc: PolicyDoc,
  roleArn: string
) =>
  allowedARNs(assumeRolePolicyDoc, roleArn).filter((elem) =>
    isRole(elem.allowedAssume)
  )

export const allowedUsers = (assumeRolePolicyDoc: PolicyDoc, roleArn: string) =>
  allowedARNs(assumeRolePolicyDoc, roleArn).filter((elem) =>
    isUser(elem.allowedAssume)
  )
