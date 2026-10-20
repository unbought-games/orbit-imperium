-- Session lookup lists an account's memberships on every authenticated request.
CREATE INDEX membership_account_lookup ON universe_memberships(account,universe);
