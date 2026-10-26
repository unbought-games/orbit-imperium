-- Event-time social identity captured once with each report. Recipient projections
-- filter this private union using identities visible in their own payload.
CREATE TABLE mission_report_alliances (
    report uuid PRIMARY KEY REFERENCES mission_reports(id) ON DELETE CASCADE,
    identities jsonb NOT NULL
);
