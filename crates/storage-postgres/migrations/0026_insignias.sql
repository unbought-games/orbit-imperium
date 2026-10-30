-- Authored account collections survive universe membership. No billing snapshots.
CREATE TABLE insignia_designs (
    account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    id uuid NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
    recipe jsonb NOT NULL,
    revision bigint NOT NULL CHECK (revision > 0),
    PRIMARY KEY (account, id)
);
CREATE TABLE insignia_grants (
    account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    symbol text NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    reason text NOT NULL,
    PRIMARY KEY (account, symbol)
);
CREATE TABLE empire_insignias (
    universe uuid NOT NULL,
    account uuid NOT NULL,
    design_id uuid,
    PRIMARY KEY (universe, account),
    FOREIGN KEY (universe, account) REFERENCES universe_memberships(universe, account) ON DELETE CASCADE,
    FOREIGN KEY (account, design_id) REFERENCES insignia_designs(account, id) ON DELETE SET NULL (design_id)
);
