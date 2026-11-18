-- Private test: the owner can set each tester's picture rhythm (minutes) and daily picture limit.
-- NULL means the default (60 minutes; 30 pictures a day).
ALTER TABLE hb_invites ADD COLUMN rhythm_minutes integer CHECK(rhythm_minutes IS NULL OR rhythm_minutes BETWEEN 2 AND 1440);
ALTER TABLE hb_invites ADD COLUMN daily_limit integer CHECK(daily_limit IS NULL OR daily_limit BETWEEN 1 AND 500);
INSERT INTO heartbeat_schema(version,applied_at) VALUES (16,CAST(strftime('%s','now') AS integer)*1000);
