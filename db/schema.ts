import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(), profile: text("profile").notNull(), displayed: text("displayed").notNull(), pending: text("pending"), anchor: text("anchor"), pulse: text("pulse"), memory: text("memory"),
  version: integer("version").notNull().default(1), moments: integer("moments").notNull().default(0), attempts: integer("attempts").notNull().default(0),
  day: text("day").notNull(), status: text("status").notNull().default("idle"), lastError: text("last_error"), lease: integer("lease").notNull().default(0), updatedAt: integer("updated_at").notNull(),
});
export const generations = sqliteTable("generations", { id: text("id").primaryKey(), worldId: text("world_id").notNull(), status: text("status").notNull(), model: text("model"), usage: text("usage"), createdAt: integer("created_at").notNull() });
