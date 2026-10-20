CREATE TABLE oidc_identity(issuer text NOT NULL,subject text NOT NULL,account uuid NOT NULL REFERENCES accounts(id),PRIMARY KEY(issuer,subject),UNIQUE(account));
CREATE TABLE oidc_login(issuer text NOT NULL,client_id text NOT NULL,state_hash text NOT NULL,browser_hash text NOT NULL,expires_at bigint NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(issuer,client_id,state_hash));
CREATE TABLE oidc_session(digest text PRIMARY KEY REFERENCES sessions(digest) ON DELETE CASCADE,issuer text NOT NULL,client_id text NOT NULL,sid text NOT NULL,subject text NOT NULL,payload jsonb NOT NULL);
CREATE INDEX oidc_session_binding ON oidc_session(issuer,client_id,sid);
CREATE TABLE oidc_logout_replay(issuer text NOT NULL,client_id text NOT NULL,jti text NOT NULL,expires_at bigint NOT NULL,PRIMARY KEY(issuer,client_id,jti));
