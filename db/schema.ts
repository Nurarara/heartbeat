// Generated from reviewed migrations by scripts/schema-contract.mjs --write.
import {sqliteTable,text,integer,index,uniqueIndex,primaryKey,foreignKey,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const aiAttempts=sqliteTable("ai_attempts",{
  "id":text("id").notNull().primaryKey(),
  "owner":text("owner").notNull(),
  "request_id":text("request_id").notNull(),
  "claim":text("claim").notNull(),
  "day":text("day").notNull(),
  "status":text("status").notNull(),
  "location_key":text("location_key").notNull(),
  "created_at":integer("created_at").notNull(),
  "candidate":text("candidate"),
  "art_key":text("art_key"),
  "error":text("error"),
  "image_hash":text("image_hash")
},t=>[index("hb_library_owner_created_id").on(t["owner"],t["created_at"],t["id"]),
index("ai_attempt_owner_created").on(t["owner"],t["created_at"]),
index("ai_attempt_day").on(t["day"]),
uniqueIndex("ai_attempt_owner_request").on(t["owner"],t["request_id"])]);
export const aiAuth=sqliteTable("ai_auth",{
  "slot":text("slot").notNull().primaryKey(),
  "used":integer("used").notNull()
},t=>[]);
export const aiSessions=sqliteTable("ai_sessions",{
  "id":text("id").notNull().primaryKey(),
  "expires":integer("expires").notNull(),
  "claim":text("claim"),
  "lease_until":integer("lease_until").notNull().default(0),
  "next_at":integer("next_at").notNull().default(0),
  "current_id":text("current_id"),
  "current_at":integer("current_at").notNull().default(0)
},t=>[]);
export const generations=sqliteTable("generations",{
  "id":text("id").notNull().primaryKey(),
  "world_id":text("world_id").notNull(),
  "status":text("status").notNull(),
  "model":text("model"),
  "usage":text("usage"),
  "created_at":integer("created_at").notNull()
},t=>[]);
export const hbArtworkOutbox=sqliteTable("hb_artwork_outbox",{
  "job_id":text("job_id").notNull().primaryKey(),
  "state":text("state").notNull().default("pending"),
  "attempts":integer("attempts").notNull().default(0),
  "next_attempt_at":integer("next_attempt_at").notNull(),
  "last_error":text("last_error"),
  "created_at":integer("created_at").notNull(),
  "updated_at":integer("updated_at").notNull()
},t=>[index("hb_artwork_outbox_due").on(t["state"],t["next_attempt_at"])]);
export const hbAssets=sqliteTable("hb_assets",{
  "id":text("id").notNull().primaryKey(),
  "job_id":text("job_id").notNull(),
  "owner":text("owner").notNull(),
  "world_id":text("world_id"),
  "surface_id":text("surface_id"),
  "art_key":text("art_key").notNull(),
  "image_hash":text("image_hash").notNull(),
  "mime":text("mime").notNull(),
  "width":integer("width").notNull(),
  "height":integer("height").notNull(),
  "validation_version":integer("validation_version").notNull(),
  "state":text("state").notNull(),
  "created_at":integer("created_at").notNull(),
  "updated_at":integer("updated_at").notNull()
},t=>[index("hb_assets_repair").on(t["state"],t["updated_at"]),
index("hb_assets_owner_state").on(t["owner"],t["state"],t["created_at"]),
uniqueIndex("hb_assets_art_key_unique").on(t["art_key"]),
uniqueIndex("hb_assets_job_id_unique").on(t["job_id"]),
check("hb_assets_check_0",sql.raw("state IN ('staged','ready','deleting','deleted')"))]);
export const hbBilling=sqliteTable("hb_billing",{
  "user_id":text("user_id").notNull().primaryKey(),
  "customer_id":text("customer_id"),
  "subscription_id":text("subscription_id"),
  "plan":text("plan").notNull().default("trial"),
  "status":text("status").notNull().default("none"),
  "period_start":integer("period_start").notNull().default(0),
  "period_end":integer("period_end").notNull().default(0),
  "lock":text("lock"),
  "lock_until":integer("lock_until").notNull().default(0),
  "review_required":integer("review_required").notNull().default(0),
  "last_reconciled":integer("last_reconciled").notNull().default(0),
  "next_reconcile_at":integer("next_reconcile_at").notNull().default(0),
  "reconcile_failures":integer("reconcile_failures").notNull().default(0),
  "reconcile_error":text("reconcile_error"),
  "review_reason":text("review_reason"),
  "review_event_id":text("review_event_id"),
  "checkout_lock":text("checkout_lock"),
  "checkout_lock_until":integer("checkout_lock_until").notNull().default(0)
},t=>[index("hb_billing_due").on(t["next_reconcile_at"],t["user_id"]).where(sql.raw("customer_id IS NOT NULL")),
uniqueIndex("hb_billing_customer_id_unique").on(t["customer_id"])]);
export const hbBillingAudit=sqliteTable("hb_billing_audit",{
  "id":text("id").notNull().primaryKey(),
  "user_id":text("user_id").notNull(),
  "actor":text("actor").notNull(),
  "action":text("action").notNull(),
  "reason":text("reason").notNull(),
  "event_id":text("event_id"),
  "created_at":integer("created_at").notNull()
},t=>[index("hb_billing_audit_owner").on(t["user_id"],t["created_at"])]);
export const hbBillingInbox=sqliteTable("hb_billing_inbox",{
  "id":text("id").notNull().primaryKey(),
  "type":text("type").notNull(),
  "api_version":text("api_version"),
  "payload":text("payload").notNull(),
  "payload_hash":text("payload_hash").notNull(),
  "customer_id":text("customer_id"),
  "status":text("status").notNull().default("pending"),
  "attempts":integer("attempts").notNull().default(0),
  "next_attempt_at":integer("next_attempt_at").notNull().default(0),
  "lock":text("lock"),
  "lock_until":integer("lock_until").notNull().default(0),
  "received_at":integer("received_at").notNull(),
  "processed_at":integer("processed_at"),
  "last_error":text("last_error")
},t=>[index("hb_billing_inbox_due").on(t["status"],t["next_attempt_at"],t["lock_until"],t["received_at"]),
check("hb_billing_inbox_check_0",sql.raw("status IN ('pending','processing','retry','failed','processed')"))]);
export const hbBillingReviews=sqliteTable("hb_billing_reviews",{
  "event_id":text("event_id").notNull().primaryKey(),
  "user_id":text("user_id").notNull(),
  "reason":text("reason").notNull(),
  "opened_at":integer("opened_at").notNull(),
  "resolved_at":integer("resolved_at"),
  "resolved_by":text("resolved_by"),
  "resolution":text("resolution")
},t=>[index("hb_billing_reviews_open").on(t["user_id"],t["resolved_at"],t["opened_at"])]);
export const hbCheckout=sqliteTable("hb_checkout",{
  "id":text("id").notNull().primaryKey(),
  "user_id":text("user_id").notNull(),
  "price_id":text("price_id").notNull(),
  "url":text("url"),
  "created_at":integer("created_at").notNull(),
  "session_id":text("session_id"),
  "status":text("status").notNull().default("legacy"),
  "expires_at":integer("expires_at").notNull().default(0)
},t=>[index("hb_checkout_owner_status").on(t["user_id"],t["status"],t["created_at"]),
uniqueIndex("hb_checkout_one_pending").on(t["user_id"]).where(sql.raw("status IN ('creating','open','confirming')")),
uniqueIndex("hb_checkout_session").on(t["session_id"]).where(sql.raw("session_id IS NOT NULL"))]);
export const hbCostLedger=sqliteTable("hb_cost_ledger",{
  "id":text("id").notNull().primaryKey(),
  "operation_id":text("operation_id").notNull(),
  "job_id":text("job_id").notNull(),
  "kind":text("kind").notNull(),
  "reserved_delta":integer("reserved_delta").notNull(),
  "spent_delta":integer("spent_delta").notNull(),
  "actual_micros":integer("actual_micros"),
  "created_at":integer("created_at").notNull()
},t=>[uniqueIndex("hb_cost_ledger_operation_id_kind_unique").on(t["operation_id"],t["kind"])]);
export const hbDeletions=sqliteTable("hb_deletions",{
  "id":text("id").notNull().primaryKey(),
  "owner":text("owner").notNull(),
  "state":text("state").notNull().default("pending"),
  "attempts":integer("attempts").notNull().default(0),
  "next_attempt_at":integer("next_attempt_at").notNull(),
  "last_error":text("last_error"),
  "created_at":integer("created_at").notNull(),
  "completed_at":integer("completed_at")
},t=>[index("hb_deletions_due").on(t["state"],t["next_attempt_at"]),
uniqueIndex("hb_deletions_owner_unique").on(t["owner"])]);
export const hbDevices=sqliteTable("hb_devices",{
  "id":text("id").notNull().primaryKey(),
  "owner":text("owner"),
  "secret_hash":text("secret_hash").notNull(),
  "code_hash":text("code_hash").notNull(),
  "expires":integer("expires").notNull(),
  "created_at":integer("created_at").notNull(),
  "credential_epoch":integer("credential_epoch").notNull().default(0),
  "surface_id":text("surface_id"),
  "name":text("name").notNull().default("Windows companion")
},t=>[index("hb_devices_expiry").on(t["expires"]),
uniqueIndex("hb_devices_secret_hash").on(t["secret_hash"]),
uniqueIndex("hb_devices_code_hash_unique").on(t["code_hash"])]);
export const hbDisplayEvents=sqliteTable("hb_display_events",{
  "id":text("id").notNull().primaryKey(),
  "owner_id":text("owner_id").notNull(),
  "world_id":text("world_id").notNull(),
  "surface_id":text("surface_id").notNull(),
  "asset_id":text("asset_id").notNull(),
  "kind":text("kind").notNull(),
  "sequence":integer("sequence").notNull(),
  "created_at":integer("created_at").notNull()
},t=>[index("hb_display_events_world").on(t["world_id"],t["created_at"]),
uniqueIndex("hb_display_events_surface_id_sequence_unique").on(t["surface_id"],t["sequence"]),
foreignKey({name:"hb_display_events_surface_id_owner_id_fk",columns:[t["surface_id"],t["owner_id"]],foreignColumns:[hbSurfaces["id"],hbSurfaces["owner_id"]]}).onDelete("cascade").onUpdate("no action"),
check("hb_display_events_check_0",sql.raw("kind IN ('display','more','less')"))]);
export const hbEvents=sqliteTable("hb_events",{
  "id":text("id").notNull().primaryKey(),
  "processed_at":integer("processed_at").notNull()
},t=>[]);
export const hbGoogleIdentities=sqliteTable("hb_google_identities",{
  "subject":text("subject").notNull().primaryKey(),
  "user_id":text("user_id").notNull(),
  "created_at":integer("created_at").notNull()
},t=>[uniqueIndex("hb_google_identity_user").on(t["user_id"]),
foreignKey({name:"hb_google_identities_user_id_fk",columns:[t["user_id"]],foreignColumns:[hbUsers["id"]]}).onDelete("cascade").onUpdate("no action")]);
export const hbGoogleStates=sqliteTable("hb_google_states",{
  "state_hash":text("state_hash").notNull().primaryKey(),
  "verifier":text("verifier").notNull(),
  "nonce":text("nonce").notNull(),
  "redirect_uri":text("redirect_uri").notNull(),
  "continuation":text("continuation").notNull(),
  "plan":text("plan").notNull(),
  "owner_id":text("owner_id"),
  "credential_epoch":integer("credential_epoch"),
  "expires":integer("expires").notNull()
},t=>[index("hb_google_states_expiry").on(t["expires"])]);
export const hbJobs=sqliteTable("hb_jobs",{
  "id":text("id").notNull().primaryKey(),
  "owner":text("owner").notNull(),
  "request_id":text("request_id").notNull(),
  "input":text("input").notNull(),
  "status":text("status").notNull().default("queued"),
  "result":text("result"),
  "created_at":integer("created_at").notNull(),
  "updated_at":integer("updated_at").notNull(),
  "stage_version":integer("stage_version").notNull().default(0),
  "lease":text("lease"),
  "lease_until":integer("lease_until").notNull().default(0),
  "owner_epoch":integer("owner_epoch").notNull().default(0),
  "input_hash":text("input_hash"),
  "world_id":text("world_id"),
  "surface_id":text("surface_id"),
  "context":text("context"),
  "direction":text("direction"),
  "error_category":text("error_category"),
  "stage_attempts":integer("stage_attempts").notNull().default(0),
  "deadline":integer("deadline").notNull().default(0)
},t=>[index("hb_jobs_owner_state_created").on(t["owner"],t["status"],t["created_at"]),
index("hb_jobs_owner_surface").on(t["owner"],t["surface_id"],t["created_at"]),
index("hb_jobs_repair").on(t["status"],t["updated_at"]),
uniqueIndex("hb_job_owner_request").on(t["owner"],t["request_id"])]);
export const hbLikes=sqliteTable("hb_likes",{
  "id":text("id").notNull().primaryKey(),
  "user_id":text("user_id").notNull(),
  "attempt_id":text("attempt_id").notNull()
},t=>[uniqueIndex("hb_like_owner_art").on(t["user_id"],t["attempt_id"])]);
export const hbOperatingDays=sqliteTable("hb_operating_days",{
  "day":text("day").notNull().primaryKey(),
  "attempts":integer("attempts").notNull().default(0),
  "reserved_micros":integer("reserved_micros").notNull().default(0),
  "spent_micros":integer("spent_micros").notNull().default(0)
},t=>[check("hb_operating_days_check_0",sql.raw("reserved_micros>=0")),
check("hb_operating_days_check_1",sql.raw("spent_micros>=0"))]);
export const hbOperatorAudit=sqliteTable("hb_operator_audit",{
  "id":text("id").notNull().primaryKey(),
  "actor":text("actor").notNull(),
  "action":text("action").notNull(),
  "target":text("target").notNull(),
  "reason":text("reason").notNull(),
  "created_at":integer("created_at").notNull()
},t=>[]);
export const hbProfiles=sqliteTable("hb_profiles",{
  "user_id":text("user_id").notNull().primaryKey(),
  "preferences":text("preferences"),
  "memory":text("memory"),
  "updated_at":integer("updated_at").notNull(),
  "version":integer("version").notNull().default(0)
},t=>[]);
export const hbProviderHealth=sqliteTable("hb_provider_health",{
  "provider":text("provider").notNull().primaryKey(),
  "failures":integer("failures").notNull().default(0),
  "open_until":integer("open_until").notNull().default(0),
  "category":text("category"),
  "updated_at":integer("updated_at").notNull()
},t=>[]);
export const hbProviderOperations=sqliteTable("hb_provider_operations",{
  "id":text("id").notNull().primaryKey(),
  "job_id":text("job_id").notNull(),
  "kind":text("kind").notNull(),
  "provider":text("provider").notNull(),
  "model":text("model").notNull(),
  "state":text("state").notNull(),
  "estimated_micros":integer("estimated_micros").notNull(),
  "actual_micros":integer("actual_micros"),
  "external_reference":text("external_reference"),
  "day":text("day").notNull(),
  "submitted_at":integer("submitted_at"),
  "settled_at":integer("settled_at"),
  "error_category":text("error_category")
},t=>[index("hb_provider_operations_state").on(t["state"],t["submitted_at"]),
uniqueIndex("hb_provider_operations_job_id_kind_unique").on(t["job_id"],t["kind"])]);
export const hbProviderSlots=sqliteTable("hb_provider_slots",{
  "slot":integer("slot").notNull().primaryKey(),
  "job_id":text("job_id"),
  "operation_id":text("operation_id"),
  "lease_until":integer("lease_until").notNull().default(0)
},t=>[]);
export const hbRate=sqliteTable("hb_rate",{
  "key":text("key").notNull().primaryKey(),
  "used":integer("used").notNull(),
  "reset_at":integer("reset_at").notNull()
},t=>[index("hb_rate_expiry").on(t["reset_at"])]);
export const hbSessions=sqliteTable("hb_sessions",{
  "hash":text("hash").notNull().primaryKey(),
  "user_id":text("user_id").notNull(),
  "expires":integer("expires").notNull(),
  "credential_epoch":integer("credential_epoch").notNull().default(0),
  "auth_method":text("auth_method").notNull().default("password"),
  "authenticated_at":integer("authenticated_at").notNull().default(0)
},t=>[index("hb_sessions_expiry").on(t["expires"]),
index("hb_sessions_user_expiry").on(t["user_id"],t["expires"]),
index("hb_session_user").on(t["user_id"])]);
export const hbSurfaces=sqliteTable("hb_surfaces",{
  "id":text("id").notNull().primaryKey(),
  "owner_id":text("owner_id").notNull(),
  "world_id":text("world_id").notNull(),
  "current_asset_id":text("current_asset_id"),
  "current_at":integer("current_at").notNull().default(0),
  "version":integer("version").notNull().default(1),
  "width":integer("width").notNull().default(1024),
  "height":integer("height").notNull().default(768),
  "quiet_start":integer("quiet_start").notNull().default(21),
  "quiet_end":integer("quiet_end").notNull().default(6),
  "policy_version":integer("policy_version").notNull().default(1),
  "display_sequence":integer("display_sequence").notNull().default(0),
  "updated_at":integer("updated_at").notNull()
},t=>[index("hb_surfaces_current_asset").on(t["current_asset_id"]),
index("hb_surfaces_owner_world").on(t["owner_id"],t["world_id"]),
uniqueIndex("hb_surfaces_id_owner_id_unique").on(t["id"],t["owner_id"]),
foreignKey({name:"hb_surfaces_world_id_owner_id_fk",columns:[t["world_id"],t["owner_id"]],foreignColumns:[hbWorlds["id"],hbWorlds["owner_id"]]}).onDelete("cascade").onUpdate("no action")]);
export const hbTokens=sqliteTable("hb_tokens",{
  "hash":text("hash").notNull().primaryKey(),
  "user_id":text("user_id").notNull(),
  "kind":text("kind").notNull(),
  "expires":integer("expires").notNull()
},t=>[index("hb_tokens_expiry").on(t["expires"]),
index("hb_tokens_user_kind").on(t["user_id"],t["kind"])]);
export const hbUsageAdjustments=sqliteTable("hb_usage_adjustments",{
  "request_id":text("request_id").notNull().primaryKey(),
  "owner":text("owner").notNull(),
  "period_key":text("period_key").notNull(),
  "period_start":integer("period_start").notNull(),
  "period_end":integer("period_end").notNull(),
  "delta":integer("delta").notNull(),
  "base_allowance":integer("base_allowance").notNull(),
  "allowance_before":integer("allowance_before").notNull(),
  "allowance_after":integer("allowance_after").notNull(),
  "reserved":integer("reserved").notNull(),
  "committed":integer("committed").notNull(),
  "actor":text("actor").notNull(),
  "reason":text("reason").notNull(),
  "created_at":integer("created_at").notNull()
},t=>[index("hb_usage_adjustments_period").on(t["owner"],t["period_key"],t["created_at"]),
check("hb_usage_adjustments_check_0",sql.raw("delta BETWEEN -100000 AND 100000 AND delta!=0")),
check("hb_usage_adjustments_check_1",sql.raw("base_allowance>=0")),
check("hb_usage_adjustments_check_2",sql.raw("allowance_before BETWEEN -100000 AND 100000")),
check("hb_usage_adjustments_check_3",sql.raw("allowance_after BETWEEN -100000 AND 100000")),
check("hb_usage_adjustments_check_4",sql.raw("reserved>=0")),
check("hb_usage_adjustments_check_5",sql.raw("committed>=0")),
check("hb_usage_adjustments_check_6",sql.raw("allowance_after=allowance_before+delta")),
check("hb_usage_adjustments_check_7",sql.raw("base_allowance+allowance_after>=reserved+committed"))]);
export const hbUsageLedger=sqliteTable("hb_usage_ledger",{
  "id":text("id").notNull().primaryKey(),
  "job_id":text("job_id").notNull(),
  "owner":text("owner").notNull(),
  "period_key":text("period_key").notNull(),
  "kind":text("kind").notNull(),
  "reserved_delta":integer("reserved_delta").notNull(),
  "committed_delta":integer("committed_delta").notNull(),
  "created_at":integer("created_at").notNull()
},t=>[index("hb_usage_ledger_period").on(t["owner"],t["period_key"]),
uniqueIndex("hb_usage_ledger_job_id_kind_unique").on(t["job_id"],t["kind"])]);
export const hbUsagePeriods=sqliteTable("hb_usage_periods",{
  "owner":text("owner").notNull(),
  "period_key":text("period_key").notNull(),
  "period_start":integer("period_start").notNull(),
  "period_end":integer("period_end").notNull(),
  "reserved":integer("reserved").notNull().default(0),
  "committed":integer("committed").notNull().default(0),
  "allowance_adjustment":integer("allowance_adjustment").notNull().default(0),
  "adjustment_claim":text("adjustment_claim")
},t=>[primaryKey({columns:[t["owner"],t["period_key"]]}),
check("hb_usage_periods_check_0",sql.raw("reserved>=0")),
check("hb_usage_periods_check_1",sql.raw("committed>=0")),
check("hb_usage_periods_check_2",sql.raw("allowance_adjustment BETWEEN -100000 AND 100000"))]);
export const hbUsageReservations=sqliteTable("hb_usage_reservations",{
  "job_id":text("job_id").notNull().primaryKey(),
  "owner":text("owner").notNull(),
  "period_key":text("period_key").notNull(),
  "state":text("state").notNull(),
  "created_at":integer("created_at").notNull(),
  "updated_at":integer("updated_at").notNull()
},t=>[index("hb_usage_reservation_owner").on(t["owner"],t["period_key"]),
check("hb_usage_reservations_check_0",sql.raw("state IN ('reserved','committed','released')"))]);
export const hbUsers=sqliteTable("hb_users",{
  "id":text("id").notNull().primaryKey(),
  "email":text("email").notNull(),
  "password_hash":text("password_hash").notNull(),
  "verified":integer("verified").notNull().default(0),
  "created_at":integer("created_at").notNull(),
  "lifecycle":text("lifecycle").notNull().default("active"),
  "credential_epoch":integer("credential_epoch").notNull().default(0)
},t=>[uniqueIndex("hb_users_email_unique").on(t["email"]),
check("hb_users_check_0",sql.raw("lifecycle IN ('active','deleting','deleted')"))]);
export const hbWorlds=sqliteTable("hb_worlds",{
  "id":text("id").notNull().primaryKey(),
  "owner_id":text("owner_id").notNull(),
  "preferences":text("preferences"),
  "memory":text("memory"),
  "preferences_version":integer("preferences_version").notNull().default(0),
  "memory_version":integer("memory_version").notNull().default(0),
  "event_claim":text("event_claim"),
  "updated_at":integer("updated_at").notNull()
},t=>[index("hb_worlds_owner").on(t["owner_id"]),
uniqueIndex("hb_worlds_id_owner_id_unique").on(t["id"],t["owner_id"]),
foreignKey({name:"hb_worlds_owner_id_fk",columns:[t["owner_id"]],foreignColumns:[hbUsers["id"]]}).onDelete("cascade").onUpdate("no action")]);
export const heartbeatSchema=sqliteTable("heartbeat_schema",{
  "version":integer("version").notNull().primaryKey(),
  "applied_at":integer("applied_at").notNull()
},t=>[]);
export const worlds=sqliteTable("worlds",{
  "id":text("id").notNull().primaryKey(),
  "profile":text("profile").notNull(),
  "displayed":text("displayed").notNull(),
  "pending":text("pending"),
  "anchor":text("anchor"),
  "version":integer("version").notNull().default(1),
  "moments":integer("moments").notNull().default(0),
  "attempts":integer("attempts").notNull().default(0),
  "day":text("day").notNull(),
  "status":text("status").notNull().default("idle"),
  "last_error":text("last_error"),
  "lease":integer("lease").notNull().default(0),
  "updated_at":integer("updated_at").notNull(),
  "pulse":text("pulse"),
  "memory":text("memory")
},t=>[]);
