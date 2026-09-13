# SPEC.md — Prizzle

## One-paragraph pitch

Prizzle is a bidirectional schema converter between Prisma ORM and Drizzle ORM,
shipped as a web UI and an npm-installable CLI. It targets developers migrating
an existing project between the two ORMs who don't want to hand-translate every
model, relation, and constraint by hand.

## Core features (MVP scope)

1. Parse a Prisma schema into an internal AST
2. Parse a Drizzle schema into an internal AST
3. Generate a Drizzle schema from the internal AST
4. Generate a Prisma schema from the internal AST
5. Validate schemas and surface actionable errors
6. Handle enums
7. Export converted output as a ZIP
8. CLI tool (convert / validate / batch)
9. Published to npm

## Non-goals (explicitly out of scope for MVP)

- Composite types
- MongoDB (Prisma v7 doesn't support it yet anyway — see ARCHITECTURE.md)
- Live database introspection (schema-file-to-schema-file only, no DB connection)
- Automatic migration generation (we convert schema definitions, not migration history)
- Indexes (named/compound), composite primary keys, and custom column types
  (`.$type<T>()`) — schemas using these will fail validation with a specific
  error naming the unsupported construct, rather than converting partially
  or silently dropping it

## Supported databases

PostgreSQL, MySQL, SQLite
