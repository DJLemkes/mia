const bootstrapScript = `
CREATE SCHEMA IF NOT EXISTS mia;

CREATE TABLE IF NOT EXISTS mia.tests(
  id serial primary key
);

DROP USER IF EXISTS mia_test_user;
CREATE USER mia_test_user WITH PASSWORD 'test';

DROP ROLE IF EXISTS readonly;
CREATE ROLE readonly;

GRANT readonly TO mia_test_user;

GRANT USAGE ON SCHEMA mia TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA mia TO readonly;

DO
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles  -- SELECT list can be empty for this
      WHERE  rolname = 'rds_iam') THEN

      CREATE ROLE rds_iam
   END IF;
end

GRANT rds_iam TO mia_test_user;
`
