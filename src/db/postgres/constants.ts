export enum NodeLabel {
  POSTGRES_RESOURCE = "PostgresResource",
  DATABASE = "PostgresDatabase",
  SCHEMA = "PostgresSchema",
  TABLE = "PostgresTable",
  ROLE = "PostgresRole",
}

export enum RelationLabel {
  BELONGS_TO = "BELONGS_TO",
  MEMBER_OF = "MEMBER_OF",
  HAS_GRANT = "HAS_GRANT",
}
