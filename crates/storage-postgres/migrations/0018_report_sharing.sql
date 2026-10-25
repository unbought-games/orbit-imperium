CREATE TABLE mission_report_shares (
    report uuid NOT NULL,
    recipient uuid NOT NULL,
    epoch uuid NOT NULL,
    token uuid NOT NULL UNIQUE,
    options jsonb NOT NULL,
    names_at_publication jsonb NOT NULL,
    PRIMARY KEY(report, recipient),
    FOREIGN KEY(report, recipient) REFERENCES mission_report_recipients(report, recipient) ON DELETE CASCADE
);
