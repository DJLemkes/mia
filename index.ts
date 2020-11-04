import fs from "fs"
import AWS from "aws-sdk"
import inquirer from "inquirer"
import debug from "debug"
import neo4j from "neo4j-driver"
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

const driver = neo4j.driver(
  dbCredentials.host,
  neo4j.auth.basic(dbCredentials.user, dbCredentials.password)
)

const session = driver.session({ defaultAccessMode: neo4j.session.WRITE })

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
          return awsRun(awsCredentials, regions, session)
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
        `${info.host}:${info.port}/${info.database} with user ${info.user}`
    )

    return inquirer
      .prompt([
        {
          type: "confirm",
          message: `Going to visit the following Postgres databases:\n${allDatabases.join(
            "\n"
          )}\n`,
          name: "proceed",
        },
      ])
      .then(async ({ proceed }) => {
        if (proceed) {
          for (const instance of pgInstances) {
            await postgresRun(session, instance)
          }
          return Promise.resolve()
        } else {
          return Promise.resolve("Skipping Postgres databases")
        }
      })
  }
}

parseConfig(argv.c)
  .then(async (config) => {
    await session.run("MATCH (a) DETACH DELETE a")
    await runAws(config)
    console.log("Finished processing AWS")
    await runPostgres(config)
    console.log("Finished processing Postgres")
    await crossoverRun(session)
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {
    session.close()
    driver.close()
  })
