import ora from "ora"

export const timeAndCount = <InArgs, OutArgs>(
  fn: (arg?: InArgs) => Promise<OutArgs>,
  resourceNamePlural: string,
  resultCounter: (result: OutArgs) => number
) => async (fnArg?: InArgs) => {
  const debug = require("debug")("")

  const startMessage = `Fetching ${resourceNamePlural}...`
  let spinner
  if (debug.enabled) {
    console.log(startMessage)
  } else {
    spinner = ora(`Fetching ${resourceNamePlural}...`).start()
  }

  const start = new Date()
  const results = await fn(fnArg)

  const stopMessage = `Fetched ${resultCounter(
    results
  )} ${resourceNamePlural} in ${new Date().getTime() - start.getTime()}ms`

  if (debug.enabled) {
    console.log(stopMessage)
  } else {
    spinner.succeed(stopMessage)
  }

  return results
}

export async function traverseAllPages<Response, ResponseData>(
  awsCall: AWS.Request<Response, AWS.AWSError>,
  // dataKey: string,
  extractor: (r: Response) => ResponseData[]
): Promise<ResponseData[]> {
  return new Promise((resolve, reject) => {
    let allResults = <ResponseData[]>[]
    awsCall.eachPage((err, data) => {
      if (data) {
        // allResults = allResults.concat(data[dataKey])
        allResults = allResults.concat(extractor(data))
        return true
      } else if (err) {
        reject(new Error(`Could not fetch: ${err}`))
        return true
      } else {
        resolve(allResults)
        return true
      }
    })
  })
}
