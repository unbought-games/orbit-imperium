CREATE TABLE must_rollback (value integer);
INSERT INTO must_rollback SELECT value FROM failure_control;
