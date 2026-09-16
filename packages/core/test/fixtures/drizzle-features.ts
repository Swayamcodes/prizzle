import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  managerId: integer('manager_id').references(() => users.id),
  updatedAt: timestamp('updated_at').$onUpdateFn(() => new Date()),
  unusual: text('unusual').customThing(),
});

export const posts = pgTable('posts', {
  id: integer('id').primaryKey(),
  authorId: integer('author_id').notNull().references(() => users.id),
});

export const groups = pgTable('groups', {
  id: integer('id').primaryKey(),
});

export const composite = pgTable('composite', {
  left: integer('left'),
  right: integer('right'),
}, (table) => [primaryKey({ columns: [table.left, table.right] })]);

export const usersRelations = relations(users, ({ one, many }) => ({
  manager: one(users, { fields: [users.managerId], references: [users.id] }),
  reports: many(users),
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));

export const implicitUsersToGroups = relations(users, ({ many }) => ({
  groups: many(groups),
}));

export const implicitGroupsToUsers = relations(groups, ({ many }) => ({
  users: many(users),
}));
