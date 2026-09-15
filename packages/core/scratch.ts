import { parsePrismaSchema } from './src/parsers/prisma-parser.js';
import { parseDrizzleSchema } from './src/parsers/drizzle-parser.js';
import { generateDrizzleSchema } from './src/generators/drizzle-generator.js';
import { generatePrismaSchema } from './src/generators/prisma-generator.js';
import { validateSchema } from './src/validators/schema-validator.js';
import type { Schema } from './src/types/schema.js';

// // 1. Known-good schema — should come back clean
// const goodSchema: Schema = {
//   database: 'postgresql',
//   tables: [
//     { name: 'User', fields: [{ name: 'id', type: 'Int', isRequired: true, isUnique: false, isPrimaryKey: true, isAutoIncrement: true }], relations: [{ type: 'one-to-many', fromField: 'posts', toTable: 'Post', toField: 'userId' }] },
//     { name: 'Post', fields: [{ name: 'id', type: 'Int', isRequired: true, isUnique: false, isPrimaryKey: true, isAutoIncrement: true }, { name: 'userId', type: 'Int', isRequired: true, isUnique: false, isPrimaryKey: false, isAutoIncrement: false }], relations: [{ type: 'one-to-many', fromField: 'userId', toTable: 'User', toField: 'id' }] },
//   ],
// };

// // 2. Duplicate table names
// const dupeTableSchema: Schema = {
//   database: 'postgresql',
//   tables: [
//     { name: 'User', fields: [{ name: 'id', type: 'Int', isRequired: true, isUnique: false, isPrimaryKey: true, isAutoIncrement: true }], relations: [] },
//     { name: 'User', fields: [{ name: 'id', type: 'Int', isRequired: true, isUnique: false, isPrimaryKey: true, isAutoIncrement: true }], relations: [] },
//   ],
// };

// // 3. Duplicate field name + dangling relation + zero-field table, all in one
// const brokenSchema: Schema = {
//   database: 'postgresql',
//   tables: [
//     { name: 'Weird', fields: [{ name: 'x', type: 'Int', isRequired: true, isUnique: false, isPrimaryKey: false, isAutoIncrement: false }, { name: 'x', type: 'String', isRequired: false, isUnique: false, isPrimaryKey: false, isAutoIncrement: false }], relations: [{ type: 'one-to-many', fromField: 'ghost', toTable: 'DoesNotExist', toField: 'id' }] },
//     { name: 'Empty', fields: [], relations: [] },
//   ],
// };

// console.log('good:', JSON.stringify(validateSchema(goodSchema)));
// console.log('dupeTable:', JSON.stringify(validateSchema(dupeTableSchema)));
// console.log('broken:', JSON.stringify(validateSchema(brokenSchema)));

// const schema = `
// datasource db {
//   provider = "postgresql"
//   url      = env("DATABASE_URL")
// }

// model User {
//   id    Int     @id @default(autoincrement())
//   email String  @unique
//   name  String
//   posts Post[]
// }

// model Post {
//   id     Int    @id @default(autoincrement())
//   title  String
//   userId Int
//   user   User   @relation(fields: [userId], references: [id])
// }
// `;

// const compositeSchema = `
// datasource db {
//   provider = "postgresql"
// }

// model UsersToGroups {
//   userId  Int
//   groupId Int
//   joinedAt DateTime @default(now())

//   @@id([userId, groupId])
// }
// `;


// const drizzleSchema = `
// import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';
// import { relations } from 'drizzle-orm';

// export const users = pgTable('users', {
//   id: serial('id').primaryKey(),
//   email: varchar('email', { length: 255 }).notNull().unique(),
// });

// export const posts = pgTable('posts', {
//   id: serial('id').primaryKey(),
//   title: varchar('title', { length: 255 }).notNull(),
//   userId: integer('user_id').notNull().references(() => users.id),
// });

// export const usersRelations = relations(users, ({ many }) => ({
//   posts: many(posts),
// }));

// export const postsRelations = relations(posts, ({ one }) => ({
//   user: one(users, { fields: [posts.userId], references: [users.id] }),
// }));
// `;

// const m2mSchema = `
// datasource db {
//   provider = "postgresql"
// }

// model Post {
//   id   Int    @id @default(autoincrement())
//   tags Tag[]
// }

// model Tag {
//   id    Int    @id @default(autoincrement())
//   posts Post[]
// }
// `;

// const cascadeSchema = `
// datasource db {
//   provider = "postgresql"
// }

// model User {
//   id    Int    @id @default(autoincrement())
//   posts Post[]
// }

// model Post {
//   id     Int  @id @default(autoincrement())
//   userId Int
//   user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
// }
// `;

// const mysqlSchema = `
// datasource db {
//   provider = "mysql"
// }

// model User {
//   id    Int     @id @default(autoincrement())
//   email String  @unique
//   posts Post[]
// }

// model Post {
//   id     Int  @id @default(autoincrement())
//   userId Int
//   user   User @relation(fields: [userId], references: [id])
// }
// `;

// const sqliteSchema = `
// datasource db {
//   provider = "sqlite"
// }

// model User {
//   id    Int     @id @default(autoincrement())
//   email String  @unique
//   posts Post[]
// }

// model Post {
//   id     Int  @id @default(autoincrement())
//   userId Int
//   user   User @relation(fields: [userId], references: [id])
// }
// `;

// for (const s of [mysqlSchema, sqliteSchema]) {
//   parsePrismaSchema(s)
//     .then((parsed) => Promise.all([generatePrismaSchema(parsed), generateDrizzleSchema(parsed)]))
//     .then(([prismaOut, drizzleOut]) => {
//       console.log(prismaOut);
//       console.log(drizzleOut);
//     });
// }

// parsePrismaSchema(cascadeSchema).then((s) => {
//   console.log(JSON.stringify(s, null, 2)); // confirm onDelete: "Cascade" is in the AST
//   return Promise.all([generatePrismaSchema(s), generateDrizzleSchema(s)]);
// }).then(([prismaOut, drizzleOut]) => {
//   console.log(prismaOut);
//   console.log(drizzleOut);
// });

// parsePrismaSchema(m2mSchema).then((schema) => generateDrizzleSchema(schema)).then(console.log);

// parseDrizzleSchema(drizzleSchema).then((result) => {
//   console.log(JSON.stringify(result, null, 2));
// });

// parsePrismaSchema(compositeSchema).then((result) => {
//   console.log(JSON.stringify(result, null, 2));
// });

// parsePrismaSchema(schema).then((result) => {
//   console.log(JSON.stringify(result, null, 2));
// });


// parsePrismaSchema(compositeSchema).then((s) => generatePrismaSchema(s)).then(console.log); // composite key
// parsePrismaSchema(m2mSchema).then((s) => generatePrismaSchema(s)).then(console.log); // many-to-many


// parsePrismaSchema(schema).then((s) => generateDrizzleSchema(s)).then(console.log); // User/Post — exercises the `relations` import specifically
// parsePrismaSchema(compositeSchema).then((s) => generateDrizzleSchema(s)).then(console.log); // exercises the `sql` import
// const stressSchema = `
// datasource db {
//   provider = "postgresql"
//   url      = env("DATABASE_URL")
// }

// generator client {
//   provider = "prisma-client-js"
// }

// enum Role {
//   SUPER_ADMIN
//   ADMIN
//   MODERATOR
//   USER
//   GUEST
// }

// enum OrderStatus {
//   PENDING
//   PROCESSING
//   COMPLETED
//   CANCELLED
//   REFUNDED
// }

// model User {
//   id            String         @id @default(uuid())
//   email         String         @unique
//   username      String         @unique
//   passwordHash  String         @map("password_hash")
//   role          Role           @default(USER)
//   age           Int?
//   accountBalance Decimal       @default(0.00) @db.Decimal(10, 2)
//   isActive      Boolean        @default(true)
//   metadata      Json?
//   createdAt     DateTime       @default(now()) @map("created_at")
//   updatedAt     DateTime       @updatedAt @map("updated_at")
//   profile       Profile?
//   posts         Post[]
//   comments      Comment[]
//   managerId     String?        @map("manager_id")
//   manager       User?          @relation("ManagementHierarchy", fields: [managerId], references: [id], onDelete: SetNull)
//   subordinates  User[]         @relation("ManagementHierarchy")
//   orders        Order[]

//   @@index([email, username])
//   @@map("users")
// }

// model Profile {
//   id          String    @id @default(cuid())
//   bio         String?   @db.VarChar(500)
//   website     String?
//   avatarUrl   String?   @map("avatar_url")
//   dateOfBirth DateTime? @map("date_of_birth")
//   userId      String    @unique @map("user_id")
//   user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@map("profiles")
// }

// model Post {
//   id          String     @id @default(uuid())
//   title       String     @db.VarChar(255)
//   slug        String     @unique
//   content     String     @db.Text
//   published   Boolean    @default(false)
//   viewCount   Int        @default(0) @map("view_count")
//   publishedAt DateTime?  @map("published_at")
//   authorId    String     @map("author_id")
//   author      User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
//   comments    Comment[]
//   tags        Tag[]

//   @@index([authorId, published])
//   @@map("posts")
// }

// model Comment {
//   id        String   @id @default(uuid())
//   body      String   @db.Text
//   createdAt DateTime @default(now()) @map("created_at")
//   postId    String   @map("post_id")
//   post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
//   authorId  String   @map("author_id")
//   author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)

//   @@map("comments")
// }

// model Tag {
//   id    String @id @default(uuid())
//   name  String @unique
//   posts Post[]

//   @@map("tags")
// }

// model Order {
//   id          String        @default(uuid())
//   userId      String        @map("user_id")
//   status      OrderStatus   @default(PENDING)
//   totalAmount Decimal       @db.Decimal(12, 2) @map("total_amount")
//   itemCode    String        @map("item_code")
//   user        User          @relation(fields: [userId], references: [id], onDelete: Restrict)
//   items       OrderItem[]

//   @@id([id, itemCode])
//   @@map("orders")
// }

// model OrderItem {
//   orderId       String
//   orderItemCode String @map("order_item_code")
//   productId     String @map("product_id")
//   quantity      Int    @default(1)
//   unitPrice     Decimal @db.Decimal(10, 2) @map("unit_price")
//   order         Order  @relation(fields: [orderId, orderItemCode], references: [id, itemCode], onDelete: Cascade)

//   @@id([orderId, orderItemCode, productId])
//   @@map("order_items")
// }
// `;

// parsePrismaSchema(stressSchema).then((result) => {
//   console.log(JSON.stringify(result, null, 2));
// });

// parsePrismaSchema(stressSchema).then(async (s) => {
//   const drizzle = await generateDrizzleSchema(s);
//   const prisma = await generatePrismaSchema(s);
//   console.log('=== DRIZZLE ===');
//   console.log(drizzle.code);
//   console.log(JSON.stringify(drizzle.warnings, null, 2));
//   console.log('=== PRISMA ===');
//   console.log(prisma.code);
//   console.log(JSON.stringify(prisma.warnings, null, 2));
// });

const drizzleStressSchema = `
import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().$onUpdateFn(() => new Date()),
  bio: text('bio').generatedAlwaysAs(() => 'placeholder'),
});
`;

parseDrizzleSchema(drizzleStressSchema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});

const fulltextSchema = `
datasource db {
  provider = "mysql"
}
model Post {
  id    Int    @id @default(autoincrement())
  title String
  body  String

  @@fulltext([title, body])
}
`;

parsePrismaSchema(fulltextSchema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});

