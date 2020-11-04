import fs from "fs"
import AWS from "aws-sdk"
import inquirer from "inquirer"
import debug from "debug"
import { run as awsRun } from "./src/run/aws"
import { run as postgresRun } from "./src/run/postgres"
import { run as crossoverRun } from "./src/run/crossover"
import { Config } from "./src/run/config"
import { isRight } from "fp-ts/lib/Either"

const dbCredentials = {
  host: "neo4j://localhost",
  user: "neo4j",
  password: "neo4j",
}

const argv = require("yargs")
  .alias("c", "config-file")
  .describe("c", "Path to config file for a Mia run")
  .describe("v", "verbose")
  .boolean("verbose")
  .help("h")
  .alias("h", "help")
  .demandOption(["c"]).argv

if (argv.v) debug.enable("*")

async function parseConfig(fileLocation: string) {
  const configFile = Config.decode(
    JSON.parse(fs.readFileSync(argv.c).toString())
  )

  if (isRight(configFile)) {
    return Promise.resolve(configFile.right)
  } else {
    const errors = configFile.left.map(
      (e) => `${e.context.map((f) => f.key)}\n`
    )
    return Promise.reject(
      `Could not parse configfile because of errors at keys:\n${errors}`
    )
  }
}

async function runAws(config: Config) {
  if (config.aws) {
    const regions = config.aws.regions
    const awsCredentials = new AWS.SharedIniFileCredentials({
      profile: config.aws.cliProfile,
    })

    return inquirer
      .prompt([
        {
          type: "confirm",
          message:
            `Going to use access key Id ${awsCredentials.accessKeyId} ` +
            `from profile ${config.aws.cliProfile} in region(s) ${regions}`,
          name: "proceed",
        },
      ])
      .then(async ({ proceed }) => {
        if (proceed) {
          return awsRun(awsCredentials, regions, dbCredentials)
        } else {
          return Promise.resolve("Skipping AWS")
        }
      })
  }
}

async function runPostgres(config: Config) {
  if (config.postgres) {
    const pgInstances = config.postgres.instances
    const allDatabases = pgInstances.map(
      (info) =>
        `${info.host}:${info.port}/${info.database} with user ${info.user}\n`
    )

    return inquirer
      .prompt([
        {
          type: "confirm",
          message: `Going to visit the following Postgres databases:\n${allDatabases}`,
          name: "proceed",
        },
      ])
      .then(async ({ proceed }) => {
        if (proceed) {
          return Promise.all(
            pgInstances.map(async (instanceInfo) =>
              postgresRun(dbCredentials, instanceInfo)
            )
          )
        } else {
          return Promise.resolve("Skipping Postgres databases")
        }
      })
  }
}

parseConfig(argv.c)
  .then(async (config) => {
    await runAws(config)
    console.log("Finished processing AWS")
    await runPostgres(config)
    console.log("Finished processing Postgres")
    await crossoverRun(dbCredentials)
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
