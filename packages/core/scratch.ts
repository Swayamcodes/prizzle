import { parsePrismaSchema } from './src/parsers/prisma-parser.js';
import { parseDrizzleSchema } from './src/parsers/drizzle-parser.js';
import { generateDrizzleSchema } from './src/generators/drizzle-generator.js';
import { generatePrismaSchema } from './src/generators/prisma-generator.js';

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

const m2mSchema = `
datasource db {
  provider = "postgresql"
}

model Post {
  id   Int    @id @default(autoincrement())
  tags Tag[]
}

model Tag {
  id    Int    @id @default(autoincrement())
  posts Post[]
}
`;

const cascadeSchema = `
datasource db {
  provider = "postgresql"
}

model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
}

model Post {
  id     Int  @id @default(autoincrement())
  userId Int
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
`;

parsePrismaSchema(cascadeSchema).then((s) => {
  console.log(JSON.stringify(s, null, 2)); // confirm onDelete: "Cascade" is in the AST
  return Promise.all([generatePrismaSchema(s), generateDrizzleSchema(s)]);
}).then(([prismaOut, drizzleOut]) => {
  console.log(prismaOut);
  console.log(drizzleOut);
});

parsePrismaSchema(m2mSchema).then((schema) => generateDrizzleSchema(schema)).then(console.log);

parseDrizzleSchema(drizzleSchema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});

parsePrismaSchema(compositeSchema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});

parsePrismaSchema(schema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});


parsePrismaSchema(compositeSchema).then((s) => generatePrismaSchema(s)).then(console.log); // composite key
parsePrismaSchema(m2mSchema).then((s) => generatePrismaSchema(s)).then(console.log); // many-to-many


parsePrismaSchema(schema).then((s) => generateDrizzleSchema(s)).then(console.log); // User/Post — exercises the `relations` import specifically
parsePrismaSchema(compositeSchema).then((s) => generateDrizzleSchema(s)).then(console.log); // exercises the `sql` import