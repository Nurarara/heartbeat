ALTER TABLE hb_billing ADD COLUMN last_reconciled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hb_billing ADD COLUMN next_reconcile_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hb_billing ADD COLUMN reconcile_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hb_billing ADD COLUMN reconcile_error TEXT;
ALTER TABLE hb_billing ADD COLUMN review_reason TEXT;
ALTER TABLE hb_billing ADD COLUMN review_event_id TEXT;
ALTER TABLE hb_billing ADD COLUMN checkout_lock TEXT;
ALTER TABLE hb_billing ADD COLUMN checkout_lock_until INTEGER NOT NULL DEFAULT 0;
CREATE INDEX hb_billing_due ON hb_billing(next_reconcile_at, user_id) WHERE customer_id IS NOT NULL;
ALTER TABLE hb_checkout ADD COLUMN session_id TEXT;
ALTER TABLE hb_checkout ADD COLUMN status TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE hb_checkout ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX hb_checkout_session ON hb_checkout(session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX hb_checkout_one_pending ON hb_checkout(user_id) WHERE status IN ('creating','open','confirming');
CREATE INDEX hb_checkout_owner_status ON hb_checkout(user_id,status,created_at);
CREATE TABLE hb_billing_inbox (
 id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, api_version TEXT,
 payload TEXT NOT NULL, payload_hash TEXT NOT NULL, customer_id TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','retry','failed','processed')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
 lock TEXT, lock_until INTEGER NOT NULL DEFAULT 0,
 received_at INTEGER NOT NULL, processed_at INTEGER, last_error TEXT
);
CREATE INDEX hb_billing_inbox_due ON hb_billing_inbox(status,next_attempt_at,lock_until,received_at);
CREATE TABLE hb_billing_reviews (
 event_id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL,
 opened_at INTEGER NOT NULL, resolved_at INTEGER, resolved_by TEXT, resolution TEXT
);
CREATE INDEX hb_billing_reviews_open ON hb_billing_reviews(user_id,resolved_at,opened_at);
CREATE TABLE hb_billing_audit (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, actor TEXT NOT NULL,
 action TEXT NOT NULL, reason TEXT NOT NULL, event_id TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX hb_billing_audit_owner ON hb_billing_audit(user_id,created_at);
INSERT INTO hb_billing_reviews(event_id,user_id,reason,opened_at)
 SELECT 'legacy:'||user_id,user_id,'Review held before billing inbox migration',0 FROM hb_billing WHERE review_required=1;
UPDATE hb_billing SET review_reason='Review held before billing inbox migration',review_event_id='legacy:'||user_id WHERE review_required=1;
