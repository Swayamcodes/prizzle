import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const user = pgTable("User", {
  id: serial("id").notNull().primaryKey(),
  email: text("email").notNull().unique(),
});

export const post = pgTable("Post", {
  id: serial("id").notNull().primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => user.id),
});

export const userRelations = relations(user, ({ one, many }) => ({
  posts: many(post),
}));

export const postRelations = relations(post, ({ one, many }) => ({
  user: one(user, { fields: [post.userId], references: [user.id] }),
}));
