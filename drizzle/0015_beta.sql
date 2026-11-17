-- Private beta: invite list, passwordless email codes, viewing sessions and an activity log for the owner dashboard.
CREATE TABLE hb_invites (
 email text PRIMARY KEY NOT NULL,
 note text NOT NULL DEFAULT '',
 invited_by text NOT NULL,
 invited_at integer NOT NULL
);
CREATE TABLE hb_login_codes (
 email text PRIMARY KEY NOT NULL,
 code_hash text NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 expires integer NOT NULL,
 created_at integer NOT NULL
);
CREATE INDEX hb_login_codes_expiry ON hb_login_codes(expires);
CREATE TABLE hb_view_sessions (
 id text PRIMARY KEY NOT NULL,
 user_id text NOT NULL REFERENCES hb_users(id) ON DELETE CASCADE,
 device text NOT NULL DEFAULT 'unknown',
 mood text NOT NULL DEFAULT 'auto',
 started_at integer NOT NULL,
 last_seen integer NOT NULL,
 seconds integer NOT NULL DEFAULT 0 CHECK(seconds>=0)
);
CREATE INDEX hb_view_sessions_user ON hb_view_sessions(user_id,last_seen);
CREATE INDEX hb_view_sessions_seen ON hb_view_sessions(last_seen);
CREATE TABLE hb_activity (
 id text PRIMARY KEY NOT NULL,
 user_id text,
 email text NOT NULL DEFAULT '',
 kind text NOT NULL,
 detail text NOT NULL DEFAULT '',
 created_at integer NOT NULL
);
CREATE INDEX hb_activity_time ON hb_activity(created_at);
INSERT INTO heartbeat_schema(version,applied_at) VALUES (15,CAST(strftime('%s','now') AS integer)*1000);
