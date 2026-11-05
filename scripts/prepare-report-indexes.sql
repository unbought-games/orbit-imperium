-- Retained databases: run before deploying migration 0037, outside a transaction.
-- psql -v ON_ERROR_STOP=1 -f scripts/prepare-report-indexes.sql
-- If interrupted, inspect pg_index.indisvalid; drop only an invalid listed index
-- with DROP INDEX CONCURRENTLY before rerunning.
CREATE INDEX CONCURRENTLY IF NOT EXISTS mission_report_folder ON mission_report_recipients
    (recipient, hidden, read, report) INCLUDE (created_revision, starred);
CREATE INDEX CONCURRENTLY IF NOT EXISTS mission_report_starred ON mission_report_recipients
    (recipient, hidden, report) INCLUDE (created_revision, read) WHERE starred;
