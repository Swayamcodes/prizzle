# Prizzle

[![CI](https://github.com/Swayamcodes/prizzle/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Swayamcodes/prizzle/actions/workflows/ci.yml)

Prizzle converts schema files between Prisma ORM and Drizzle ORM in both directions. It is for projects migrating ORMs that need their models, scalar fields, relations, and supported constraints translated without hand-rewriting every schema; a web UI and CLI both use the same framework-independent conversion core.

## Example

Prisma input:

```prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
```

Drizzle output:

```ts
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const user = pgTable('User', {
  id: serial('id').notNull().primaryKey(),
  email: text('email').notNull().unique(),
});

export const post = pgTable('Post', {
  id: serial('id').notNull().primaryKey(),
  authorId: integer('authorId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const userRelations = relations(user, ({ many }) => ({
  posts: many(post),
}));
```

## CLI

From a checkout, install dependencies, build the core package and CLI, then install the CLI globally:

```sh
pnpm install
pnpm --filter @swayamshinde/core build
pnpm --filter prizzle-cli build
cd packages/cli
pnpm add -g .
cd ../..
```

If `prizzle: command not found` after this, pnpm's global bin directory isn't on your `PATH` yet:

```sh
pnpm setup
```

Then open a new terminal and retry `pnpm add -g .` from `packages/cli`.

Convert a Prisma schema to Drizzle:

```sh
prizzle convert prisma/schema.prisma --to drizzle --output drizzle/schema.ts
```

Convert a Drizzle TypeScript schema to Prisma, letting the `.ts` extension select the source format:

```sh
prizzle convert src/db/schema.ts --to prisma --output prisma/schema.prisma
```

Use `--from prisma` or `--from drizzle` when an input filename does not end in `.prisma` or `.ts`. Without `--output`, converted code is written to standard output.

```sh
prizzle convert schema.txt --from prisma --to drizzle
```

## Web UI

Install dependencies, then run the Next.js app:

```sh
pnpm install
pnpm --filter @prizzle/web dev
```

## Supported conversions

Prizzle supports PostgreSQL, MySQL, and SQLite schemas in both directions:

- Prisma to Drizzle
- Drizzle to Prisma

## Known Limitations

These cases do not stop the rest of a schema from converting. Prizzle emits a clear warning naming the unsupported construct and includes a warning comment with the preserved original source for manual completion.

- **Composite primary keys:** field-level primary-key metadata cannot represent a multi-column key.
- **Composite or table-level foreign keys:** a relation with multiple local or referenced fields cannot be represented by single-field relation metadata.
- **Indexes:** Prisma `@@index`, `@@unique`, and `@@fulltext`, plus Drizzle `index()` and `uniqueIndex()`, are not generated.
- **Implicit many-to-many relations:** no join table is generated automatically; define the join table manually in Drizzle.
- **Enum and `Decimal` field types:** these are emitted as `text`/`String` with a warning rather than as native typed constructs.
- **Named relation disambiguation:** multiple relations to the same target model are not disambiguated by relation name.
- **Drizzle `pgEnum` and `generatedAlwaysAsIdentity`:** these Drizzle-specific constructs are not represented directly in the shared schema model.

## Tech stack

| Area                 | Tool                | Version |
| -------------------- | ------------------- | ------- |
| Monorepo             | pnpm                | 12.x    |
| Language             | TypeScript          | 7.0.x   |
| Prisma parsing       | `@prisma/internals` | 7.x     |
| Core formatting      | Prettier            | 3.x     |
| Web                  | Next.js             | 16.3.x  |
| UI                   | React               | 19.2.x  |
| Editor               | Monaco Editor       | latest  |
| Styling              | Tailwind CSS        | 4.x     |
| API validation       | Zod                 | 4.6.x   |
| CLI                  | Commander.js        | 15.x    |
| CLI prompts          | `@inquirer/prompts` | 7.x     |
| CLI output           | Chalk               | 5.x     |
| Generated ORM target | `drizzle-orm`       | ~0.45.x |

For scope, design rationale, and contributor conventions, see [SPEC.md](SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [CLAUDE.md](CLAUDE.md).
