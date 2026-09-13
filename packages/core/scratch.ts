import { parsePrismaSchema } from './src/parsers/prisma-parser.js';
import { parseDrizzleSchema } from './src/parsers/drizzle-parser.js';

const schema = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String
  posts Post[]
}

model Post {
  id     Int    @id @default(autoincrement())
  title  String
  userId Int
  user   User   @relation(fields: [userId], references: [id])
}
`;

const compositeSchema = `
datasource db {
  provider = "postgresql"
}

model UsersToGroups {
  userId  Int
  groupId Int
  joinedAt DateTime @default(now())

  @@id([userId, groupId])
}
`;


const drizzleSchema = `
import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, { fields: [posts.userId], references: [users.id] }),
}));
`;

parseDrizzleSchema(drizzleSchema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});

parsePrismaSchema(compositeSchema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});

parsePrismaSchema(schema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});