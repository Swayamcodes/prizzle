import { parsePrismaSchema } from './src/parsers/prisma-parser.js';

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

parsePrismaSchema(compositeSchema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});

parsePrismaSchema(schema).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});