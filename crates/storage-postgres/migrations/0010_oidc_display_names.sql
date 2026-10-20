-- OIDC names are mutable display claims, not local credential identifiers.
ALTER TABLE accounts DROP CONSTRAINT accounts_name_key;
CREATE UNIQUE INDEX accounts_local_name ON accounts(name) WHERE password_hash <> '!oidc';
