# prizzle-cli

`prizzle-cli` converts schema files between Prisma ORM and Drizzle ORM. It uses the same conversion core as the Prizzle web converter and reports conversion warnings and validation issues for manual review.

## Installation

```sh
npm install -g prizzle-cli
```

Verify the installation:

```sh
prizzle --help
```

## Usage

Convert Prisma to Drizzle:

```sh
prizzle convert prisma/schema.prisma --to drizzle --output drizzle/schema.ts
```

Convert Drizzle to Prisma:

```sh
prizzle convert src/db/schema.ts --to prisma --output prisma/schema.prisma
```

Without `--output`, the converted schema is printed to standard output:

```sh
prizzle convert schema.prisma --to drizzle
```

## Options

```text
prizzle convert <input-file> --to <prisma|drizzle> [--from <prisma|drizzle>] [--output <file>]
```

| Option                     | Description                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `<input-file>`             | Input Prisma or Drizzle schema file.                             |
| `--to <prisma\|drizzle>`   | Required target schema format.                                   |
| `--from <prisma\|drizzle>` | Optional source format override.                                 |
| `--output <file>`          | Write the converted schema to a file instead of standard output. |

The source format is detected automatically for `.prisma` and `.ts` files. For another extension, provide `--from prisma` or `--from drizzle`; otherwise, the CLI prompts you to choose the source format.

## Supported conversions

- Prisma to Drizzle
- Drizzle to Prisma
- PostgreSQL, MySQL, and SQLite schemas in both directions

## Limitations

Unsupported constructs do not stop the rest of a schema from converting. Prizzle reports warnings with the affected construct and preserved source where available.

- Composite primary keys are not represented as field-level primary-key metadata.
- Composite or table-level foreign keys cannot be represented by single-field relation metadata.
- Prisma indexes and Drizzle `index()` / `uniqueIndex()` declarations are not generated.
- Implicit many-to-many relations do not generate a join table automatically.
- Enum and `Decimal` fields are emitted as `text` / `String` with a warning.
- Multiple relations to the same target model are not disambiguated by relation name.
- Drizzle `pgEnum` and `generatedAlwaysAsIdentity` are not represented directly.

## Links

- [Live web converter](https://prizzle.vercel.app)
- [Prizzle repository](https://github.com/Swayamcodes/prizzle)

## License

MIT
