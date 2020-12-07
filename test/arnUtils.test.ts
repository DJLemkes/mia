import { Right } from "fp-ts/lib/Either"
import { matchesResource } from "../src/db/aws/arnUtils"
import { IAMArn } from "../src/db/aws/policyDocUtils"

test("matchesResource", () => {
  const glueMatcher = matchesResource("glue")
  const almostGlueMatcher = matchesResource("glu")
  const glueArn = (IAMArn.decode(
    "arn:aws:glue:us-east-1:123456789012:job/testjob"
  ) as Right<IAMArn>).right

  expect(glueMatcher(glueArn)).toBe(true)
})
