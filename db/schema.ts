import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(), profile: text("profile").notNull(), displayed: text("displayed").notNull(), pending: text("pending"), anchor: text("anchor"), pulse: text("pulse"), memory: text("memory"),
  version: integer("version").notNull().default(1), moments: integer("moments").notNull().default(0), attempts: integer("attempts").notNull().default(0),
  day: text("day").notNull(), status: text("status").notNull().default("idle"), lastError: text("last_error"), lease: integer("lease").notNull().default(0), updatedAt: integer("updated_at").notNull(),
});
export const generations = sqliteTable("generations", { id: text("id").primaryKey(), worldId: text("world_id").notNull(), status: text("status").notNull(), model: text("model"), usage: text("usage"), createdAt: integer("created_at").notNull() });
export const aiSessions = sqliteTable("ai_sessions", {
  id: text("id").primaryKey(), expires: integer("expires").notNull(),
  claim: text("claim"), leaseUntil: integer("lease_until").notNull().default(0), nextAt: integer("next_at").notNull().default(0),
  currentId: text("current_id"), currentAt: integer("current_at").notNull().default(0),
});
export const aiAttempts = sqliteTable("ai_attempts", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), requestId: text("request_id").notNull(), claim: text("claim").notNull(), day: text("day").notNull(),
  status: text("status").notNull(), locationKey: text("location_key").notNull(), createdAt: integer("created_at").notNull(),
  candidate: text("candidate"), artKey: text("art_key"), imageHash: text("image_hash"), error: text("error"),
}, table => [uniqueIndex("ai_attempt_owner_request").on(table.owner, table.requestId), index("ai_attempt_day").on(table.day), index("ai_attempt_owner_created").on(table.owner, table.createdAt)]);
export const aiAuth = sqliteTable("ai_auth", { slot: text("slot").primaryKey(), used: integer("used").notNull() });
export const hbUsers = sqliteTable('hb_users', { id: text('id').primaryKey(), email: text('email').notNull().unique(), passwordHash: text('password_hash').notNull(), verified: integer('verified').notNull().default(0), createdAt: integer('created_at').notNull() });
export const hbSessions = sqliteTable('hb_sessions', { hash: text('hash').primaryKey(), userId: text('user_id').notNull(), expires: integer('expires').notNull() }, t => [index('hb_session_user').on(t.userId)]);
export const hbTokens = sqliteTable('hb_tokens', { hash: text('hash').primaryKey(), userId: text('user_id').notNull(), kind: text('kind').notNull(), expires: integer('expires').notNull() });
export const hbProfiles = sqliteTable('hb_profiles', { userId: text('user_id').primaryKey(), preferences: text('preferences'), memory: text('memory'), updatedAt: integer('updated_at').notNull() });
export const hbBilling = sqliteTable('hb_billing', { userId: text('user_id').primaryKey(), customerId: text('customer_id').unique(), subscriptionId: text('subscription_id'), plan: text('plan').notNull().default('trial'), status: text('status').notNull().default('none'), periodStart: integer('period_start').notNull().default(0), periodEnd: integer('period_end').notNull().default(0), lock: text('lock'), lockUntil: integer('lock_until').notNull().default(0), reviewRequired: integer('review_required').notNull().default(0) });
export const hbEvents = sqliteTable('hb_events', { id: text('id').primaryKey(), processedAt: integer('processed_at').notNull() });
export const hbCheckout = sqliteTable('hb_checkout', { id: text('id').primaryKey(), userId: text('user_id').notNull(), priceId: text('price_id').notNull(), url: text('url'), createdAt: integer('created_at').notNull() });
export const hbLikes = sqliteTable('hb_likes', { id: text('id').primaryKey(), userId: text('user_id').notNull(), attemptId: text('attempt_id').notNull() }, t => [uniqueIndex('hb_like_owner_art').on(t.userId, t.attemptId)]);
export const hbJobs = sqliteTable('hb_jobs', { id: text('id').primaryKey(), owner: text('owner').notNull(), requestId: text('request_id').notNull(), input: text('input').notNull(), status: text('status').notNull().default('queued'), result: text('result'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull() }, t => [uniqueIndex('hb_job_owner_request').on(t.owner, t.requestId)]);
export const hbDevices = sqliteTable('hb_devices', { id: text('id').primaryKey(), owner: text('owner'), secretHash: text('secret_hash').notNull(), codeHash: text('code_hash').notNull().unique(), expires: integer('expires').notNull(), createdAt: integer('created_at').notNull() });
export const hbRate = sqliteTable('hb_rate', { key: text('key').primaryKey(), used: integer('used').notNull(), resetAt: integer('reset_at').notNull() });
