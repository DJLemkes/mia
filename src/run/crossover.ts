import neo4j, { Session } from "neo4j-driver"
import { setupAWSPostgresRelations } from "../db/crossover"

export async function run(session: Session) {
  const transaction = session.beginTransaction()

  await setupAWSPostgresRelations(transaction)
  await transaction.commit()
}
