import neo4j from "neo4j-driver"
import { setupAWSPostgresRelations } from "../db/crossover"

export async function run(neo4jCredentials) {
  const driver = neo4j.driver(
    neo4jCredentials.host,
    neo4j.auth.basic(neo4jCredentials.user, neo4jCredentials.password)
  )
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE })
  // await session.run("MATCH (a) DETACH DELETE a")
  const transaction = session.beginTransaction()

  await setupAWSPostgresRelations(transaction)
  await transaction.commit()
  session.close()
  driver.close()
}
