-- A recovered/deleting account cannot keep using sessions issued before a
-- credential rotation. Existing sessions belong to epoch zero on upgrade.
ALTER TABLE hb_sessions ADD COLUMN credential_epoch INTEGER NOT NULL DEFAULT 0;
CREATE INDEX hb_sessions_user_expiry ON hb_sessions(user_id, expires);
CREATE INDEX hb_tokens_user_kind ON hb_tokens(user_id, kind);
