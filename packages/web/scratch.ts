// packages/web/scratch.ts
import { POST } from './src/app/api/convert/route.js';

const m2mPrismaSchema = `
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

const cleanSchema = `
datasource db {
  provider = "postgresql"
}
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}
model Post {
  id     Int  @id @default(autoincrement())
  userId Int
  user   User @relation(fields: [userId], references: [id])
}
`;

const cleanReq = new Request('http://localhost/api/convert', {
  method: 'POST',
  body: JSON.stringify({ sourceFormat: 'prisma', targetFormat: 'drizzle', schema: cleanSchema }),
});

POST(cleanReq).then((res) => res.json()).then((body) => console.log(JSON.stringify(body, null, 2)));

const req = new Request('http://localhost/api/convert', {
  method: 'POST',
  body: JSON.stringify({ sourceFormat: 'prisma', targetFormat: 'drizzle', schema: m2mPrismaSchema }),
});

POST(req).then((res) => res.json()).then((body) => console.log(JSON.stringify(body, null, 2)));