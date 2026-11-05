-- Follow the existing runtime-index rollout: build retained-table indexes online.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mission_report_recipients) AND
     (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND i.indisvalid
        AND c.relname IN ('mission_report_folder','mission_report_starred')) < 2 THEN
    RAISE EXCEPTION 'prepare report indexes online: run scripts/prepare-report-indexes.sql and verify pg_index.indisvalid'
      USING CONSTRAINT='orbit_report_online_indexes';
  END IF;
END $$;

ALTER TABLE mission_report_cursors ADD COLUMN filters jsonb NOT NULL DEFAULT
    '{"hidden":null,"unread_only":false,"starred_only":false,"sort":"newest"}';
ALTER TABLE mission_report_cursors ADD COLUMN last_value text;

-- Recipient-first candidate lookup avoids scanning other players' history.
CREATE INDEX IF NOT EXISTS mission_report_folder ON mission_report_recipients
    (recipient, hidden, read, report) INCLUDE (created_revision, starred);
CREATE INDEX IF NOT EXISTS mission_report_starred ON mission_report_recipients
    (recipient, hidden, report) INCLUDE (created_revision, read) WHERE starred;
