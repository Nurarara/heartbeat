ALTER TABLE hb_jobs ADD COLUMN stage_version integer NOT NULL DEFAULT 0;
ALTER TABLE hb_jobs ADD COLUMN lease text;
ALTER TABLE hb_jobs ADD COLUMN lease_until integer NOT NULL DEFAULT 0;
ALTER TABLE hb_jobs ADD COLUMN owner_epoch integer NOT NULL DEFAULT 0;
ALTER TABLE hb_jobs ADD COLUMN input_hash text;
ALTER TABLE hb_jobs ADD COLUMN world_id text;
ALTER TABLE hb_jobs ADD COLUMN surface_id text;
ALTER TABLE hb_jobs ADD COLUMN context text;
ALTER TABLE hb_jobs ADD COLUMN direction text;
ALTER TABLE hb_jobs ADD COLUMN error_category text;
ALTER TABLE hb_jobs ADD COLUMN stage_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE hb_jobs ADD COLUMN deadline integer NOT NULL DEFAULT 0;
CREATE INDEX hb_jobs_repair ON hb_jobs(status,updated_at);
CREATE INDEX hb_jobs_owner_surface ON hb_jobs(owner,surface_id,created_at);
CREATE TABLE hb_artwork_outbox (
 job_id text PRIMARY KEY NOT NULL, state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 next_attempt_at integer NOT NULL, last_error text, created_at integer NOT NULL, updated_at integer NOT NULL
);
CREATE INDEX hb_artwork_outbox_due ON hb_artwork_outbox(state,next_attempt_at);
CREATE TABLE hb_usage_periods (
 owner text NOT NULL, period_key text NOT NULL, period_start integer NOT NULL, period_end integer NOT NULL,
 reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0), committed integer NOT NULL DEFAULT 0 CHECK(committed>=0),
 PRIMARY KEY(owner,period_key)
);
CREATE TABLE hb_usage_reservations (
 job_id text PRIMARY KEY NOT NULL, owner text NOT NULL, period_key text NOT NULL,
 state text NOT NULL CHECK(state IN ('reserved','committed','released')), created_at integer NOT NULL, updated_at integer NOT NULL
);
CREATE INDEX hb_usage_reservation_owner ON hb_usage_reservations(owner,period_key);
CREATE TABLE hb_usage_ledger (
 id text PRIMARY KEY NOT NULL, job_id text NOT NULL, owner text NOT NULL, period_key text NOT NULL,
 kind text NOT NULL, reserved_delta integer NOT NULL, committed_delta integer NOT NULL, created_at integer NOT NULL,
 UNIQUE(job_id,kind)
);
CREATE INDEX hb_usage_ledger_period ON hb_usage_ledger(owner,period_key);
CREATE TABLE hb_operating_days (
 day text PRIMARY KEY NOT NULL, attempts integer NOT NULL DEFAULT 0,
 reserved_micros integer NOT NULL DEFAULT 0 CHECK(reserved_micros>=0), spent_micros integer NOT NULL DEFAULT 0 CHECK(spent_micros>=0)
);
CREATE TABLE hb_provider_operations (
 id text PRIMARY KEY NOT NULL, job_id text NOT NULL, kind text NOT NULL,
 provider text NOT NULL, model text NOT NULL, state text NOT NULL,
 estimated_micros integer NOT NULL, actual_micros integer, external_reference text,
 day text NOT NULL, submitted_at integer, settled_at integer, error_category text,
 UNIQUE(job_id,kind)
);
CREATE INDEX hb_provider_operations_state ON hb_provider_operations(state,submitted_at);
CREATE TABLE hb_cost_ledger (
 id text PRIMARY KEY NOT NULL, operation_id text NOT NULL, job_id text NOT NULL, kind text NOT NULL,
 reserved_delta integer NOT NULL, spent_delta integer NOT NULL, actual_micros integer, created_at integer NOT NULL,
 UNIQUE(operation_id,kind)
);
CREATE TABLE hb_provider_slots (
 slot integer PRIMARY KEY NOT NULL, job_id text, operation_id text, lease_until integer NOT NULL DEFAULT 0
);
CREATE TABLE hb_provider_health (
 provider text PRIMARY KEY NOT NULL, failures integer NOT NULL DEFAULT 0, open_until integer NOT NULL DEFAULT 0,
 category text, updated_at integer NOT NULL
);
CREATE TABLE hb_assets (
 id text PRIMARY KEY NOT NULL, job_id text NOT NULL UNIQUE, owner text NOT NULL, world_id text, surface_id text,
 art_key text NOT NULL UNIQUE, image_hash text NOT NULL, mime text NOT NULL,
 width integer NOT NULL, height integer NOT NULL, validation_version integer NOT NULL,
 state text NOT NULL CHECK(state IN ('staged','ready','deleting','deleted')),
 created_at integer NOT NULL, updated_at integer NOT NULL
);
CREATE INDEX hb_assets_owner_state ON hb_assets(owner,state,created_at);
CREATE INDEX hb_assets_repair ON hb_assets(state,updated_at);
CREATE INDEX hb_tokens_expiry ON hb_tokens(expires);
CREATE INDEX hb_sessions_expiry ON hb_sessions(expires);
CREATE INDEX hb_rate_expiry ON hb_rate(reset_at);
CREATE UNIQUE INDEX hb_devices_secret_hash ON hb_devices(secret_hash);
CREATE INDEX hb_devices_expiry ON hb_devices(expires);
INSERT OR IGNORE INTO hb_operating_days(day,attempts)
 SELECT day,COUNT(*) FROM ai_attempts GROUP BY day;
INSERT OR IGNORE INTO hb_assets(id,job_id,owner,art_key,image_hash,mime,width,height,validation_version,state,created_at,updated_at)
 SELECT id,'legacy-'||id,owner,art_key,COALESCE(image_hash,''),'image/jpeg',0,0,0,'ready',created_at,created_at
 FROM ai_attempts WHERE art_key IS NOT NULL AND status IN ('ready','displayed');
INSERT OR IGNORE INTO hb_artwork_outbox(job_id,state,next_attempt_at,created_at,updated_at)
 SELECT id,'pending',updated_at,created_at,updated_at FROM hb_jobs WHERE status='queued';
UPDATE hb_jobs SET status='accepted',deadline=created_at+1800000 WHERE status='queued';
UPDATE hb_jobs SET status='outcome_unknown',error_category='legacy_interrupted',deadline=created_at+1800000 WHERE status='running';
