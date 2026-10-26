ALTER TABLE hb_users ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','deleting','deleted'));
ALTER TABLE hb_users ADD COLUMN credential_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hb_devices ADD COLUMN credential_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hb_devices ADD COLUMN surface_id TEXT;
ALTER TABLE hb_devices ADD COLUMN name TEXT NOT NULL DEFAULT 'Windows companion';
ALTER TABLE hb_profiles ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE hb_worlds (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES hb_users(id) ON DELETE CASCADE,
 preferences TEXT, memory TEXT, preferences_version INTEGER NOT NULL DEFAULT 0,
 memory_version INTEGER NOT NULL DEFAULT 0, event_claim TEXT, updated_at INTEGER NOT NULL,
 UNIQUE(id,owner_id)
);
CREATE INDEX hb_worlds_owner ON hb_worlds(owner_id);
CREATE TABLE hb_surfaces (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, world_id TEXT NOT NULL,
 current_asset_id TEXT, current_at INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1, width INTEGER NOT NULL DEFAULT 1024, height INTEGER NOT NULL DEFAULT 768,
 quiet_start INTEGER NOT NULL DEFAULT 21, quiet_end INTEGER NOT NULL DEFAULT 6, policy_version INTEGER NOT NULL DEFAULT 1,
 display_sequence INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
 FOREIGN KEY(world_id,owner_id) REFERENCES hb_worlds(id,owner_id) ON DELETE CASCADE,
 UNIQUE(id,owner_id)
);
CREATE INDEX hb_surfaces_owner_world ON hb_surfaces(owner_id,world_id);
CREATE TABLE hb_display_events (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, world_id TEXT NOT NULL, surface_id TEXT NOT NULL,
 asset_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('display','more','less')),
 sequence INTEGER NOT NULL, created_at INTEGER NOT NULL,
 FOREIGN KEY(surface_id,owner_id) REFERENCES hb_surfaces(id,owner_id) ON DELETE CASCADE,
 UNIQUE(surface_id,sequence)
);
CREATE INDEX hb_display_events_world ON hb_display_events(world_id,created_at);
CREATE TABLE hb_deletions (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL UNIQUE, state TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, last_error TEXT,
 created_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE INDEX hb_deletions_due ON hb_deletions(state,next_attempt_at);
CREATE TABLE hb_operator_audit (
 id TEXT PRIMARY KEY NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL,
 reason TEXT NOT NULL, created_at INTEGER NOT NULL
);
INSERT INTO hb_worlds(id,owner_id,preferences,memory,preferences_version,updated_at)
 SELECT 'world-'||u.id,u.id,p.preferences,p.memory,CASE WHEN p.preferences IS NULL THEN 0 ELSE 1 END,COALESCE(p.updated_at,u.created_at)
 FROM hb_users u LEFT JOIN hb_profiles p ON p.user_id=u.id;
INSERT INTO hb_surfaces(id,owner_id,world_id,current_asset_id,current_at,updated_at)
 SELECT 'surface-'||u.id,u.id,'world-'||u.id,s.current_id,COALESCE(s.current_at,0),u.created_at
 FROM hb_users u LEFT JOIN ai_sessions s ON s.id=u.id;
UPDATE hb_devices SET surface_id='surface-'||owner WHERE owner IS NOT NULL;
