CREATE INDEX hb_library_owner_created_id ON ai_attempts(owner,created_at,id);
CREATE INDEX hb_jobs_owner_state_created ON hb_jobs(owner,status,created_at);
CREATE INDEX hb_surfaces_current_asset ON hb_surfaces(current_asset_id);
CREATE TABLE heartbeat_schema (
 version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL
);
INSERT INTO heartbeat_schema(version,applied_at) VALUES (12,1792713600000);
