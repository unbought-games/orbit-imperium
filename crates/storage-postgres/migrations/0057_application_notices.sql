-- Existing applications predate delivery. A notice lives only as long as its application.
ALTER TABLE alliance_applications
    ADD COLUMN notified_reviewers uuid[] NOT NULL DEFAULT '{}';
