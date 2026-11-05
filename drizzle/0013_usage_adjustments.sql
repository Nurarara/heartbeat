ALTER TABLE hb_usage_periods ADD COLUMN allowance_adjustment integer NOT NULL DEFAULT 0 CHECK(allowance_adjustment BETWEEN -100000 AND 100000);
ALTER TABLE hb_usage_periods ADD COLUMN adjustment_claim text;
CREATE TABLE hb_usage_adjustments (
 request_id text PRIMARY KEY NOT NULL,
 owner text NOT NULL, period_key text NOT NULL, period_start integer NOT NULL, period_end integer NOT NULL,
 delta integer NOT NULL CHECK(delta BETWEEN -100000 AND 100000 AND delta!=0),
 base_allowance integer NOT NULL CHECK(base_allowance>=0),
 allowance_before integer NOT NULL CHECK(allowance_before BETWEEN -100000 AND 100000),
 allowance_after integer NOT NULL CHECK(allowance_after BETWEEN -100000 AND 100000),
 reserved integer NOT NULL CHECK(reserved>=0), committed integer NOT NULL CHECK(committed>=0),
 actor text NOT NULL, reason text NOT NULL, created_at integer NOT NULL,
 CHECK(allowance_after=allowance_before+delta),
 CHECK(base_allowance+allowance_after>=reserved+committed)
);
CREATE INDEX hb_usage_adjustments_period ON hb_usage_adjustments(owner,period_key,created_at);
INSERT INTO heartbeat_schema(version,applied_at) VALUES (13,CAST(strftime('%s','now') AS integer)*1000);
