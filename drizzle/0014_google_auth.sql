ALTER TABLE hb_sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'password';
ALTER TABLE hb_sessions ADD COLUMN authenticated_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE hb_google_identities (
 subject TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES hb_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX hb_google_identity_user ON hb_google_identities(user_id);
CREATE TABLE hb_google_states (
 state_hash TEXT PRIMARY KEY NOT NULL,
 verifier TEXT NOT NULL,
 nonce TEXT NOT NULL,
 redirect_uri TEXT NOT NULL,
 continuation TEXT NOT NULL,
 plan TEXT NOT NULL,
 owner_id TEXT,
 credential_epoch INTEGER,
 expires INTEGER NOT NULL
);
CREATE INDEX hb_google_states_expiry ON hb_google_states(expires);
INSERT INTO heartbeat_schema(version,applied_at) VALUES (14,CAST(strftime('%s','now') AS integer)*1000);
