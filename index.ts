import AWS from "aws-sdk"
import inquirer from "inquirer"
import debug from "debug"
import { run as awsRun } from "./src/run/aws"
import { run as postgresRun } from "./src/run/postgres"

const argv = require("yargs")
  .alias("cf", "credentials-file")
  .describe("cf", "Path to AWS credentials file")
  .alias("p", "profile")
  .describe("p", "Profile to use from AWS credentials file")
  .alias("r", "region")
  .describe("r", "List of regions to process")
  .array("r")
  .describe("approve", "Continue with credentials and regions without prompt")
  .boolean("approve")
  .describe("v", "verbose")
  .boolean("verbose")
  .default({ p: "default", approve: false })
  .help("h")
  .alias("h", "help").argv

if (argv.v) debug.enable("*")

const iniCredentials = new AWS.IniLoader().loadFrom(argv.cf)
const regions = argv.r
  ? argv.r
  : iniCredentials[argv.p]
  ? [iniCredentials[argv.p].region]
  : ["eu-central-1"]

const awsCredentials = new AWS.SharedIniFileCredentials({
  profile: argv.p,
})

const dbCredentials = {
  host: "neo4j://localhost",
  user: "neo4j",
  password: "neo4j",
}

const program = argv.approve
  ? Promise.resolve(awsRun(awsCredentials, regions, dbCredentials))
  : inquirer
      .prompt([
        {
          type: "confirm",
          message:
            `Going to use access key Id ${awsCredentials.accessKeyId} ` +
            `from profile ${argv.p} in region(s) ${regions}`,
          name: "proceed",
        },
      ])
      .then(async ({ proceed }) => {
        if (proceed) {
          return postgresRun(dbCredentials)
          // return awsRun(awsCredentials, regions, dbCredentials)
        } else {
          console.log("Exiting...")
          return Promise.resolve()
        }
      })

program
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
