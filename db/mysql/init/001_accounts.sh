#!/bin/sh
set -eu

# The MySQL image runs init scripts after creating the database and root account.
# Use URL-safe hex passwords in .env so SQL string literals remain unambiguous.
mysql --host=localhost -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS 'crms_app'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
CREATE USER IF NOT EXISTS 'crms_admin'@'%' IDENTIFIED BY '${MYSQL_ADMIN_PASSWORD}';
CREATE USER IF NOT EXISTS 'crms_migrator'@'%' IDENTIFIED BY '${MYSQL_MIGRATOR_PASSWORD}';
CREATE USER IF NOT EXISTS 'crms_readonly'@'%' IDENTIFIED BY '${MYSQL_READONLY_PASSWORD}';
CREATE ROLE IF NOT EXISTS ai_crms_migrator;
GRANT CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, EXECUTE, TRIGGER, EVENT ON ai_crms.* TO ai_crms_migrator;
GRANT GRANT OPTION ON ai_crms.* TO ai_crms_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.* TO ai_crms_migrator WITH GRANT OPTION;
GRANT CREATE USER, ROLE_ADMIN ON *.* TO 'crms_migrator'@'%';
GRANT GRANT OPTION ON ai_crms.* TO 'crms_migrator'@'%';
GRANT ai_crms_migrator TO 'crms_migrator'@'%';
SET DEFAULT ROLE ai_crms_migrator TO 'crms_migrator'@'%';
CREATE TABLE IF NOT EXISTS ai_crms.schema_migrations(
  version VARCHAR(120) PRIMARY KEY,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
GRANT SELECT, INSERT ON ai_crms.schema_migrations TO 'crms_migrator'@'%';
SQL
