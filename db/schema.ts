import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const ideas = sqliteTable("ideas", {
  id: text("id").primaryKey(), title: text("title").notNull(), content: text("content").notNull().default(""), category: text("category").notNull().default("Personnel"), status: text("status").notNull().default("Capturée"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
