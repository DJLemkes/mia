import fs from "fs"
import inquirer from "inquirer"
import debug from "debug"
import neo4j from "neo4j-driver"
import {
  confirmationQuestion as awsConfirmQuestion,
  run as awsRun,
} from "./src/run/aws"
import {
  confirmationQuestion as pgConfirmQuestion,
  run as postgresRun,
} from "./src/run/postgres"
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
  const confirmQuestion = awsConfirmQuestion(config)

  if (confirmQuestion) {
    return inquirer
      .prompt([
        {
          type: "confirm",
          message: confirmQuestion,
          name: "proceed",
        },
      ])
      .then(async ({ proceed }) => {
        if (proceed) {
          await awsRun(config, session)
          return Promise.resolve("Finished processing AWS")
        } else {
          return Promise.resolve("Skipping AWS")
        }
      })
  } else {
    return Promise.resolve("No AWS config found")
  }
}

async function runPostgres(config: Config) {
  const confirmQuestion = pgConfirmQuestion(config)

  if (confirmQuestion) {
    return inquirer
      .prompt([
        {
          type: "confirm",
          message: confirmQuestion,
          name: "proceed",
        },
      ])
      .then(async ({ proceed }) => {
        if (proceed) {
          await postgresRun(session, config)
          return Promise.resolve("Finished processing Postgres")
        } else {
          return Promise.resolve("Skipping Postgres databases")
        }
      })
  } else {
    return Promise.resolve("No Postgres config found")
  }
}

parseConfig(argv.c)
  .then(async (config) => {
    await session.run("MATCH (a) DETACH DELETE a")
    const awsMessage = await runAws(config)
    console.log(awsMessage)
    const pgMessage = await runPostgres(config)
    console.log(pgMessage)
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
