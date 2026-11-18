-- Private test: a total picture limit per tester, access requests from the website, and a log of the owner's changes.
ALTER TABLE hb_invites ADD COLUMN total_limit integer CHECK(total_limit IS NULL OR total_limit BETWEEN 1 AND 100000);
CREATE TABLE hb_access_requests (
 id text PRIMARY KEY NOT NULL,
 email text NOT NULL,
 name text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','invited','dismissed')),
 created_at integer NOT NULL,
 handled_at integer
);
CREATE INDEX hb_access_requests_status ON hb_access_requests(status,created_at);
CREATE INDEX hb_access_requests_email ON hb_access_requests(email);
CREATE TABLE hb_admin_log (
 id text PRIMARY KEY NOT NULL,
 actor text NOT NULL,
 target text NOT NULL DEFAULT '',
 action text NOT NULL,
 before text NOT NULL DEFAULT '',
 after text NOT NULL DEFAULT '',
 created_at integer NOT NULL
);
CREATE INDEX hb_admin_log_time ON hb_admin_log(created_at);
INSERT INTO heartbeat_schema(version,applied_at) VALUES (17,CAST(strftime('%s','now') AS integer)*1000);
