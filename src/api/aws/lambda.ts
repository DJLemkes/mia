import AWS from "aws-sdk"
import { timeAndCount, traverseAllPages } from "./utils"

export async function fetchLambdas(): Promise<
  AWS.Lambda.FunctionConfiguration[]
> {
  const lambda = new AWS.Lambda()
  return traverseAllPages(lambda.listFunctions(), (r) => r.Functions || [])
}

export const timedFetchLambdas = timeAndCount(
  fetchLambdas,
  "Lambdas",
  (r) => r.length
)

export default { timedFetchLambdas }
