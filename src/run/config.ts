import * as t from "io-ts"

const AWSConfig = t.type({
  cliProfile: t.string,
  regions: t.array(t.string),
})

type AWSConfig = t.TypeOf<typeof AWSConfig>

const PostgresInstance = t.intersection([
  t.type({
    host: t.readonly(t.string),
    port: t.readonly(t.number),
    database: t.readonly(t.string),
    user: t.readonly(t.string),
    password: t.readonly(t.string),
  }),
  t.partial({
    rdsId: t.readonly(t.string),
    rdsRegion: t.readonly(t.string),
  }),
])

type PostgresInstance = t.TypeOf<typeof PostgresInstance>

export const Config = t.partial({
  aws: AWSConfig,
  postgres: t.type({
    instances: t.array(PostgresInstance),
  }),
})

export type Config = t.TypeOf<typeof Config>
