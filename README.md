# Prizzle

[![CI](https://github.com/Swayamcodes/prizzle/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Swayamcodes/prizzle/actions/workflows/ci.yml)

Prizzle converts schema files between Prisma ORM and Drizzle ORM in both directions. It is for projects migrating ORMs that need their models, scalar fields, relations, and supported constraints translated without hand-rewriting every schema; a web UI and CLI both use the same framework-independent conversion core.

Try the [live web converter](https://prizzle.vercel.app), or install the [`prizzle-cli` npm package](https://www.npmjs.com/package/prizzle-cli).

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

Install the CLI globally from npm:

```sh
npm install -g prizzle-cli
```

Verify that it is available:

```sh
prizzle --help
```

Convert a Prisma schema to Drizzle:

```sh
prizzle convert prisma/schema.prisma --to drizzle --output drizzle/schema.ts
```

Convert a Drizzle TypeScript schema to Prisma:

```sh
prizzle convert src/db/schema.ts --to prisma --output prisma/schema.prisma
```

The `--output` option writes the converted schema to the specified file. If you omit it, the converted schema is printed to standard output.

Prizzle detects the source format automatically from the input extension:

- `.prisma` files are treated as Prisma schemas.
- `.ts` files are treated as Drizzle schemas.

For another extension, use `--from prisma` or `--from drizzle` explicitly:

```sh
prizzle convert schema.txt --from prisma --to drizzle
```

The command prompts you to choose Prisma or Drizzle when the extension is not `.prisma` or `.ts` and `--from` is not provided.

### CLI options

| Option                     | Description                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `<input-file>`             | Input Prisma or Drizzle schema file.                             |
| `--to <prisma\|drizzle>`   | Required target schema format.                                   |
| `--from <prisma\|drizzle>` | Optional source format override.                                 |
| `--output <file>`          | Write the converted schema to a file instead of standard output. |

## Web UI

Use the hosted converter at [https://prizzle.vercel.app](https://prizzle.vercel.app).

## Development

The following commands are for contributors testing a local checkout. `pnpm add -g .` installs the locally built CLI; it is not the recommended end-user installation path.

```sh
pnpm install
pnpm --filter @swayamshinde/core build
pnpm --filter prizzle-cli build
cd packages/cli
pnpm add -g .
cd ../..
```

If `prizzle: command not found` after a local global install, pnpm's global bin directory may not be on your `PATH`:

```sh
pnpm setup
```

Open a new terminal, then retry `pnpm add -g .` from `packages/cli`.

To work on the web app locally:

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
